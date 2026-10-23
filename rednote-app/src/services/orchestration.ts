// Client-side orchestration that replaces Celery async tasks + polling.
// Each step persists to IndexedDB so a failure is retryable from partial state,
// and emits the current record via onStage so the UI can drive StatusRail.

import { bffService } from './bffService';
import { analyze, copy as llmCopy, coverImage, enhanceCoverVisual, planCover, titles as llmTitles } from './geminiService';
import { genId, saveAnalysis, saveGeneration, saveSession } from './historyStore';
import { bodyIsTooSimilar, titleIsTooSimilar } from './originality';
import { selectClickableTitles, hasEnoughHighQualityTitles } from './titleQuality';
import { checkCompliance } from './compliance';
import type {
  Analysis,
  Comment,
  Generation,
  Note,
  NoteSnapshot,
  Report,
  Session,
} from '../types';

const DEFAULT_BRIEF =
  '基于原笔记的主题、受众和爆款结构进行同类型复刻；保持核心内容方向，但必须重新组织观点并原创表达，不照抄原文。';
const TITLES_RETRY_SUFFIX =
  '\n上一批候选缺少点击欲望或原创度。请增加具体场景、可信反差和口语节奏，彻底更换句式与切入角度，禁止空洞营销词。';
const COPY_RETRY_FEEDBACK =
  '上一稿与原帖过于相似，请完全重建观点顺序和语言表达；视频笔记必须同时给出6—10个完整分镜。';

function mapNote(note: NoteSnapshot, comments: Comment[]): Note {
  return {
    id: note.note_id,
    type: note.note_type,
    title: note.title,
    content: note.content,
    author: { ...(note.author as any), name: note.author?.name || '未知作者' },
    metrics: note.metrics,
    media: {
      images: note.images,
      video_url: note.video_url || undefined,
      cover_url: note.cover_url || undefined,
    },
    comments: comments.filter((c) => c.content).map((c) => ({ content: c.content, likes: c.likes })),
  };
}

function truncateError(error: unknown): string {
  return String((error as Error)?.message || error).slice(0, 2000);
}

// ---------------- analyze ----------------

export interface AnalyzeOptions {
  id?: string;
  onStage?: (analysis: Analysis) => void;
}

export async function analyzeFlow(url: string, opts: AnalyzeOptions = {}): Promise<Analysis> {
  const analysis: Analysis = {
    id: opts.id || genId('an'),
    source_url: url,
    status: 'fetching',
    stage: 'fetching_note',
    created_at: new Date().toISOString(),
  };

  const emit = () => {
    saveAnalysis(analysis).catch((e) => console.error('[analyzeFlow] persist failed', e));
    opts.onStage?.({ ...analysis });
  };

  try {
    emit(); // fetching_note

    const note = await bffService.fetchNote(url);
    const comments = await bffService.fetchComments(note.note_id, url);
    analysis.note = mapNote(note, comments);
    emit();

    analysis.status = 'processing_media';
    analysis.stage = 'processing_media';
    emit();

    const coverUrl = note.cover_url || note.images[0] || null;
    if (coverUrl) {
      try {
        const media = await bffService.fetchMedia({ coverUrl });
        analysis.source_cover_data_url = media.sourceCoverDataUrl || undefined;
      } catch (mediaError) {
        // Source cover is optional for the text-only report; vision steps degrade gracefully.
        console.warn('[analyzeFlow] media fetch failed', mediaError);
      }
    }

    analysis.status = 'analyzing';
    analysis.stage = 'core_text_analysis';
    emit();

    const report: Report = await analyze(note, comments);
    analysis.report = report;
    analysis.model_version = 'gemini-3-flash-preview';

    // Optional vision enrichment — non-blocking on timeout, never fails the report.
    if (analysis.source_cover_data_url) {
      try {
        const visual = await enhanceCoverVisual(
          { title: note.title, note_type: note.note_type },
          analysis.source_cover_data_url,
        );
        if (visual) {
          report.cover_visual = visual;
        }
      } catch (visualError) {
        console.warn('[analyzeFlow] cover visual enrichment failed', visualError);
      }
    }

    analysis.status = 'completed';
    analysis.stage = 'completed';
    emit();
    return analysis;
  } catch (error) {
    analysis.status = 'failed';
    analysis.error = truncateError(error);
    emit();
    throw error;
  }
}

// ---------------- titles ----------------

export interface TitlesResult {
  session_id: string;
  titles: string[];
  input_compliance: ReturnType<typeof checkCompliance>;
}

export async function generateTitlesFlow(analysis: Analysis, briefInput: string): Promise<TitlesResult> {
  if (analysis.status !== 'completed' || !analysis.report) {
    throw new Error('分析完成后才能生成标题');
  }
  const brief = briefInput.trim() || DEFAULT_BRIEF;
  const inputCompliance = checkCompliance(brief);
  const sourceTitle = analysis.note?.title || '';
  const report = analysis.report;

  let candidates = await llmTitles(report, brief, sourceTitle);
  let titlesList = selectClickableTitles(candidates, sourceTitle);

  if (titlesList.length < 3 || !hasEnoughHighQualityTitles(titlesList)) {
    const improved = await llmTitles(report, brief + TITLES_RETRY_SUFFIX, sourceTitle);
    // 合并两批候选统一排序；第二批不理想时仍保留第一批中可用的原创标题。
    candidates = [...candidates, ...improved];
    titlesList = selectClickableTitles(candidates, sourceTitle);
  }
  if (titlesList.length < 3) {
    throw new Error('生成标题与原帖或候选之间过于相似，请重新生成');
  }

  const session: Session & { analysis_id: string } = {
    session_id: genId('ss'),
    analysis_id: analysis.id,
    brief,
    titles: titlesList,
  };
  await saveSession(session);
  return { session_id: session.session_id, titles: titlesList, input_compliance: inputCompliance };
}

// ---------------- generate ----------------

export interface GenerateOptions {
  id?: string;
  onStage?: (generation: Generation) => void;
}

export async function generateFlow(
  analysis: Analysis,
  session: Session,
  selectedTitle: string,
  opts: GenerateOptions = {},
): Promise<Generation> {
  const isVideo = analysis.note?.type === 'video';
  const sourceTitle = analysis.note?.title || '';
  const sourceContent = analysis.note?.content || '';
  const report = analysis.report!;

  if (titleIsTooSimilar(sourceTitle, selectedTitle)[0]) {
    throw new Error('所选标题与原帖过于相似，已阻止生成');
  }

  const generation: Generation & { session_id: string; analysis_id: string } = {
    id: opts.id || genId('gn'),
    status: 'generating',
    stage: 'generating_copy',
    selected_title: selectedTitle,
    created_at: new Date().toISOString(),
    session_id: session.session_id,
    analysis_id: analysis.id,
  };

  const emit = () => {
    saveGeneration(generation).catch((e) => console.error('[generateFlow] persist failed', e));
    opts.onStage?.({ ...generation });
  };

  try {
    emit(); // generating_copy

    let generated: Awaited<ReturnType<typeof llmCopy>> | null = null;
    let similarityScores: Record<string, number> = {};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (let transportAttempt = 0; transportAttempt < 2; transportAttempt += 1) {
        try {
          generated = await llmCopy(
            report,
            session.brief,
            selectedTitle,
            isVideo,
            sourceTitle,
            sourceContent,
            attempt ? COPY_RETRY_FEEDBACK : '',
          );
          break;
        } catch (copyError) {
          const isTimeout = /timed out|timeout/i.test(String((copyError as Error)?.message || ''));
          if (!isTimeout || transportAttempt === 1) throw copyError;
        }
      }
      const [blocked, scores] = bodyIsTooSimilar(sourceContent, generated!.body);
      similarityScores = scores;
      if (!blocked && (!isVideo || (generated!.video_script && generated!.video_script.length > 0))) break;
    }
    if (!generated || bodyIsTooSimilar(sourceContent, generated.body)[0]) {
      throw new Error('正文原创性检查未通过，系统已阻止交付近似内容');
    }
    if (isVideo && (!generated.video_script || generated.video_script.length === 0)) {
      throw new Error('视频脚本分镜生成不完整，请重新生成');
    }

    const tags = generated.tags.map((t) => t.replace(/^#+/, '').trim()).filter(Boolean).slice(0, 6);
    generation.body = generated.body.trim() + (tags.length ? `\n\n${tags.map((t) => `#${t}`).join(' ')}` : '');
    generation.video_script = isVideo && generated.video_script ? { shots: generated.video_script } : null;
    generation.compliance = {
      ...checkCompliance(`${generation.body} ${selectedTitle}`),
      originality: { passed: true, scores: similarityScores },
    };

    generation.stage = 'generating_cover';
    emit();

    // ---- cover (failure here only records cover_error; body is still delivered) ----
    try {
      const coverVisual = analysis.report?.cover_visual || ({} as any);
      const visualReference = [
        String(coverVisual?.summary || ''),
        ...((coverVisual?.evidence || []).map(String)),
      ].join(' ');

      // Resolve the source cover, re-fetching if the analysis lacks a downloaded copy.
      let sourceCover = analysis.source_cover_data_url;
      if (!sourceCover) {
        const coverUrl = analysis.note?.media?.cover_url || analysis.note?.media?.images?.[0] || null;
        if (!coverUrl) throw new Error('原爆款没有可读取的封面，无法进行封面类型复刻');
        sourceCover = (await bffService.fetchMedia({ coverUrl })).sourceCoverDataUrl;
      }

      const coverPlan = await planCover(selectedTitle, sourceCover);
      const planReference = [
        `封面类型：${coverPlan.cover_type}`,
        `主体：${coverPlan.subject}`,
        `构图：${coverPlan.composition}`,
        `配色：${coverPlan.palette}`,
        `标题位置：${coverPlan.title_position}`,
        `视觉风格：${coverPlan.visual_style}`,
        visualReference,
      ].join('；');

      if (coverPlan.cover_type !== 'text_only') {
        const materialSafeReference = [
          `source cover type to preserve: ${coverPlan.cover_type}`,
          `composition method to preserve: ${coverPlan.composition}`,
          `palette method to preserve: ${coverPlan.palette}`,
          `title position to preserve: ${coverPlan.title_position}`,
          `visual style to preserve: ${coverPlan.visual_style}`,
          `typographic symbols to preserve: ${coverPlan.typography_symbols.join(', ')}`,
          `emphasis method to preserve: ${coverPlan.emphasis_method}`,
          `line break pattern to preserve: ${coverPlan.line_break_pattern}`,
          `FORBIDDEN source subject/material: ${coverPlan.subject}`,
          `NEW subject must come from title: ${selectedTitle}`,
          `NEW subject must come from user brief: ${session.brief}`,
        ].join('; ');
        const baseImage = await coverImage(selectedTitle, materialSafeReference, session.brief);
        const { coverDataUrl } = await bffService.composeCover({
          coverType: 'photo_text',
          baseImageB64: baseImage,
          title: selectedTitle,
          typography: {
            typography_symbols: coverPlan.typography_symbols,
            emphasis_method: coverPlan.emphasis_method,
            line_break_pattern: coverPlan.line_break_pattern,
            title_position: coverPlan.title_position,
          },
          visualReference,
          variant: generation.id,
        });
        generation.cover_url = coverDataUrl;
      } else {
        const { coverDataUrl } = await bffService.composeCover({
          coverType: 'text_only',
          title: selectedTitle,
          visualReference: planReference,
          variant: generation.id,
        });
        generation.cover_url = coverDataUrl;
      }
    } catch (coverError) {
      generation.compliance = { ...(generation.compliance || {}), cover_error: truncateError(coverError) };
    }

    generation.status = 'completed';
    generation.stage = 'completed';
    emit();
    return generation;
  } catch (error) {
    generation.status = 'failed';
    generation.stage = 'failed';
    generation.error = truncateError(error);
    emit();
    throw error;
  }
}
