import { createReadStream, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';

import {
  enrollCloneVoice,
  synthesizeSpeech,
  synthesizeVoice,
  isCloneVoiceUnavailableError,
} from './bailianSpeech';
import {
  applyCameraShake,
  downloadToFile,
  extractOriginalAudio,
  extractSpeechTrack,
  inspectVideo,
  muxAudioIntoVideo,
  probeDuration,
  restoreOriginalAudio,
  stripVideoAudio,
} from './media';
import {
  BAILIAN_TTS_MODEL,
  BAILIAN_SPEECH_LANGUAGE_LABELS,
  bailianSpeechLanguageLabel,
  isBailianSpeechLanguageSupported,
  isCloneVoiceId,
  buildCloneVoicePrefix,
  previewTextForLanguage,
} from '../shared/speechContract';

import { config } from './config';
import { findLocalAsset, getPublicAssetBaseUrl, publicAssetUrl, readBinaryBody, saveLocalAsset } from './localAssets';
import { mirrorLocalFileToCOS } from './cosMirror';
import {
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  createMultimodalVideoTask,
  getMultimodalVideoTask,
} from './cprt';
import { buildConversionSlots } from '../shared/cprtContract';
import { calculateVideoPointCost } from '../shared/pricing';
import { isTokendanceTask } from './tokendance';
import { recognizeSpeech } from './asr';
import { translateScript } from './translate';
import {
  RequestValidationError,
  parseStartCloneInput,
  requireHttpsUrl,
  requireString,
  type RunBody,
} from './validation';

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * jobId -> finalize 后的最终成片素材文件名（复刻音色配音版）。
 * CPRT 任务记录里的 videoUrl 是「未替换音轨」的原始成片；
 * finalize 产生的最终成片必须落盘记录，否则刷新页面 / 重新查询任务
 * 会把旧 URL 发给前端，用户听到的就不是复刻音色。
 * 只存文件名不存完整 URL：隧道域名每次重启都会变，读取时再拼当前公网地址。
 */
const finalizedJobsFile = path.join(config.assetStorageDir, 'finalized-jobs.json');
const finalizedAssetNameByJobId = new Map<string, string>();

function loadFinalizedJobs(): void {
  try {
    const raw = JSON.parse(fsSync.readFileSync(finalizedJobsFile, 'utf8'));
    for (const [jobId, fileName] of Object.entries(raw || {})) {
      if (typeof fileName === 'string' && fileName) {
        finalizedAssetNameByJobId.set(jobId, fileName);
      }
    }
  } catch {
    // 文件不存在或损坏时静默忽略，不影响启动。
  }
}

function recordFinalizedVideo(jobId: string, assetFileName: string): void {
  finalizedAssetNameByJobId.set(jobId, assetFileName);
  try {
    fsSync.mkdirSync(config.assetStorageDir, { recursive: true });
    const raw: Record<string, string> = {};
    for (const [id, fileName] of finalizedAssetNameByJobId) {
      raw[id] = fileName;
    }
    fsSync.writeFileSync(finalizedJobsFile, JSON.stringify(raw, null, 2));
  } catch (err) {
    console.warn('[video-clone-seedance-bff] persist finalized-jobs failed:', err);
  }
}

/** 取某任务的最终成片公网 URL（素材仍在本地时重新拼当前隧道地址）。 */
function finalizedVideoUrlForJob(jobId: string): string | undefined {
  const fileName = finalizedAssetNameByJobId.get(jobId);
  if (!fileName) {
    return undefined;
  }
  const asset = findLocalAsset(fileName);
  return asset ? publicAssetUrl(asset) : undefined;
}

loadFinalizedJobs();

const sourceAudioJobsFile = path.join(config.assetStorageDir, 'source-audio-jobs.json');
const sourceAudioByJobId = new Map<string, string>();
const restoringAudioByJobId = new Map<string, Promise<string>>();
try {
  const saved = JSON.parse(fsSync.readFileSync(sourceAudioJobsFile, 'utf8'));
  for (const [jobId, fileName] of Object.entries(saved)) {
    if (typeof fileName === 'string' && findLocalAsset(fileName)) {
      sourceAudioByJobId.set(jobId, fileName);
    }
  }
} catch {
  // No source-audio jobs have been submitted yet.
}

function recordSourceAudio(jobId: string, fileName: string): void {
  sourceAudioByJobId.set(jobId, fileName);
  fsSync.writeFileSync(sourceAudioJobsFile, JSON.stringify(Object.fromEntries(sourceAudioByJobId), null, 2));
}

async function restoreSourceAudioForJob(jobId: string, providerVideoUrl: string): Promise<string> {
  const existing = finalizedVideoUrlForJob(jobId);
  if (existing) return existing;
  const pending = restoringAudioByJobId.get(jobId);
  if (pending) return pending;
  const task = (async () => {
    const sourceAudioName = sourceAudioByJobId.get(jobId);
    const sourceAudio = sourceAudioName ? findLocalAsset(sourceAudioName) : null;
    if (sourceAudioName && !sourceAudio) throw new Error(`原视频音轨丢失，无法为任务 ${jobId} 恢复音频`);
    const workDir = path.join(config.assetStorageDir, '.speech-work');
    await fs.mkdir(workDir, { recursive: true });
    const stamp = crypto.randomUUID();
    const videoPath = path.join(workDir, `${stamp}-generated.mp4`);
    const outputPath = path.join(workDir, `${stamp}-restored.mp4`);
    try {
      await resolveLocalOrDownload(providerVideoUrl, videoPath);
      if (sourceAudio) await restoreOriginalAudio(videoPath, sourceAudio.filePath, outputPath);
      const asset = saveLocalAsset(`finalized_${stamp}.mp4`, 'video/mp4', await fs.readFile(sourceAudio ? outputPath : videoPath));
      recordFinalizedVideo(jobId, path.basename(asset.filePath));
      return publicAssetUrl(asset);
    } finally {
      await fs.rm(videoPath, { force: true }).catch(() => {});
      await fs.rm(outputPath, { force: true }).catch(() => {});
    }
  })();
  restoringAudioByJobId.set(jobId, task);
  try {
    return await task;
  } finally {
    restoringAudioByJobId.delete(jobId);
  }
}

/**
 * 换语言但没填台词时：从参考视频抽音轨 → 语音识别原台词 → 翻译成目标语言。
 * 译文会直接作为 TTS 文本，合成音频后交给 CPRT 对口型生成。
 */
async function detectAndTranslateScript(input: {
  referenceVideoUrl: string;
  targetLanguage: string;
  workDir: string;
  stamp: string;
}): Promise<{ originalText: string; translatedText: string }> {
  const srcVideoPath = path.join(input.workDir, `${input.stamp}-asr-video.mp4`);
  const audioPath = path.join(input.workDir, `${input.stamp}-asr-audio.mp3`);
  try {
    // 优先用本地文件，避免通过隧道下载参考视频超时（隧道可能不稳定）。
    await resolveLocalOrDownload(input.referenceVideoUrl, srcVideoPath);
    // 用 16kHz 单声道的轻量音轨做识别：体积只有原来的四分之一，
    // 避免 base64 请求体过大被服务端掐断连接。
    await extractSpeechTrack(srcVideoPath, audioPath, 15);
    const audioBase64 = (await fs.readFile(audioPath)).toString('base64');
    const originalText = await recognizeSpeech({ audioBase64, format: 'mp3', sampleRate: 16000 });
    if (!originalText) {
      throw new RequestValidationError(
        '没能从参考视频里识别出人声台词（可能是纯背景音乐、无人声或音质太差）。'
        + '请在「AI 换声 / 换语言」面板手动填写目标语言台词后重试。',
        400,
      );
    }
    // 保持语言时不翻译，直接用原台词让复刻音色合成。
    const translatedText = input.targetLanguage === 'keep'
      ? originalText
      : await translateScript({ text: originalText, targetLanguage: input.targetLanguage });
    console.log(`[video-clone-seedance-bff] auto script -> lang=${input.targetLanguage} original="${originalText}" translated="${translatedText}"`);
    return { originalText, translatedText };
  } finally {
    await fs.rm(srcVideoPath, { force: true }).catch(() => {});
    await fs.rm(audioPath, { force: true }).catch(() => {});
  }
}

async function readJsonBody(req: IncomingMessage): Promise<RunBody> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 2 * 1024 * 1024) {
      throw new RequestValidationError('Request body is too large.', 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestValidationError('Request body must be valid JSON.', 400);
  }
}

/**
 * 优先用本地素材文件（避免隧道下载超时），找不到时回退 downloadToFile。
 */
async function resolveLocalOrDownload(url: string, destPath: string): Promise<void> {
  const assetMatch = url.match(/\/assets\/(.+)$/);
  if (assetMatch) {
    const local = findLocalAsset(decodeURIComponent(assetMatch[1]));
    if (local?.filePath) {
      await fs.copyFile(local.filePath, destPath);
      return;
    }
  }
  await downloadToFile(url, destPath);
}

/**
 * 把指向本地缓存素材的 URL 改写成隧道公网 URL。覆盖两类地址：
 * 1. 本地素材服务 URL（http://127.0.0.1:9894/assets/...，隧道未启动时上传的素材）；
 * 2. 旧隧道域名 URL（quick tunnel 每次重启都换域名，前端/历史任务里存的旧地址已 404）。
 * 素材可以先只缓存在本地；等到生成/换声需要公网地址时，只要隧道已启动就能直接用，无需重新上传。
 * 只改写确实缓存在本地的素材：外部 URL（即便路径里带 /assets/）原样放行。
 */
function rewriteLocalAssetUrl(value: string): string {
  const raw = String(value || '');
  const match = raw.match(/^https?:\/\/[^/]+\/assets\/(.+)$/);
  if (!match) {
    return value;
  }
  if (!findLocalAsset(decodeURIComponent(match[1]))) {
    return value;
  }
  const baseUrl = getPublicAssetBaseUrl();
  if (/^https:\/\//i.test(baseUrl)) {
    return `${baseUrl}/assets/${match[1]}`;
  }
  throw new RequestValidationError(
    '素材已缓存在本地，但生成需要公网 HTTPS 地址。请运行 start_app.bat 或 bash relaunch_video_clone_seedance_v2.sh（隧道会一并启动）后重试，无需重新上传素材。',
    503,
  );
}

function rewriteBodyAssetUrls(body: RunBody, keys: string[]): void {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string') {
      body[key] = rewriteLocalAssetUrl(value);
    } else if (Array.isArray(value)) {
      body[key] = value.map((item) => (typeof item === 'string' ? rewriteLocalAssetUrl(item) : item));
    }
  }
}

/**
 * 提交给 CPRT 前的最后一跳：本地/隧道素材 URL → COS 镜像地址（国内节点，TOS 拉取稳定）。
 * 只处理确实缓存在本地的素材（含旧隧道域名 URL）；镜像失败时原样返回，由隧道地址兜底。
 */
async function mirrorAssetUrlToCOS(value: string): Promise<string> {
  const raw = String(value || '');
  const match = raw.match(/^https?:\/\/[^/]+\/assets\/(.+)$/);
  if (!match) {
    return value;
  }
  const local = findLocalAsset(decodeURIComponent(match[1]));
  if (!local) {
    return value;
  }
  const mirrored = await mirrorLocalFileToCOS(local.filePath, local.fileName, local.contentType);
  console.log(`[video-clone-seedance-bff] cos mirror -> ${local.fileName} ${mirrored ? 'cos' : 'fallback(tunnel)'}`);
  return mirrored || value;
}

async function dispatch(body: RunBody): Promise<unknown> {
  const action = String(body.action || '').trim();

  switch (action) {
    case 'health': {
      return {
        status: 'ok',
        service: 'video-clone-seedance-bff',
        hasCprtKey: Boolean(config.cprtApiKey),
        hasTokendanceKey: Boolean(config.tokendanceApiKey),
        hasBailianKey: Boolean(config.bailianApiKey),
        bailianWorkspaceId: config.bailianWorkspaceId || null,
        bailianModel: BAILIAN_TTS_MODEL,
        models: CPRT_MULTIMODAL_VIDEO_MODELS,
        resolutionsByModel: CPRT_RESOLUTIONS_BY_MODEL,
        ratios: CPRT_RATIOS,
      };
    }

    case 'inspect_reference_video': {
      // 优先用本地文件路径探测，避免通过隧道公网 URL 调 ffprobe 超时。
      const rawUrl = String(body.sourceUrl || '').trim();
      const assetMatch = rawUrl.match(/\/assets\/(.+)$/);
      let inspectSource = rawUrl;
      if (assetMatch) {
        const local = findLocalAsset(decodeURIComponent(assetMatch[1]));
        if (local?.filePath) {
          inspectSource = local.filePath;
        }
      }
      if (!assetMatch || inspectSource === rawUrl) {
        // 非本地素材或找不到本地文件：走公网 URL，但需要 rewrite 成隧道地址。
        rewriteBodyAssetUrls(body, ['sourceUrl']);
        inspectSource = requireHttpsUrl(body, 'sourceUrl');
      }
      const inspection = await inspectVideo(inspectSource);
      return inspection;
    }

    case 'quote_clone_job': {
      try {
        const model = requireString(body, 'model');
        const resolution = requireString(body, 'resolution');
        const durationSeconds = Number(body.durationSeconds);
        return {
          model,
          resolution,
          durationSeconds,
          pointCost: calculateVideoPointCost(model, resolution, durationSeconds),
        };
      } catch (error) {
        throw new RequestValidationError(error instanceof Error ? error.message : 'Invalid pricing parameters.', 400);
      }
    }

    case 'start_clone_job': {
      rewriteBodyAssetUrls(body, ['referenceVideoUrl', 'imageUrls', 'voiceAudioUrl']);
      const input = parseStartCloneInput(body);
      const pointCost = calculateVideoPointCost(input.model, input.resolution, input.durationSeconds);

      // 语音替换：生成前先用百炼声音复刻音色把目标台词合成音频，作为 audioUrls 交给 CPRT 对口型生成。
      // 这样音频连贯（一次性合成）且嘴型与语音逐字对齐，解决「音频不连贯 / 不对口型」。
      let autoScript: { originalText: string; translatedText: string } | undefined;
        // Only synthesized speech is sent to the provider; original audio stays local.
        let voiceAudioKind: 'tts' | 'source' | null = null;
      if (input.voiceReplacement.enabled) {
        const workDir = path.join(config.assetStorageDir, '.speech-work');
        await fs.mkdir(workDir, { recursive: true });
        const stamp = crypto.randomUUID();

        // 没填台词时自动识别参考视频原台词：
        // - 换语言：识别后翻译成目标语言
        // - 保持语言但已上传音色样本：识别原台词后用复刻音色合成（「用克隆声音说原话」）
        // - 保持语言且无音色样本：走下面的 else-if 分支，直接提取原音轨给 CPRT 对口型
        if (!input.voiceReplacement.script) {
          if (input.voiceReplacement.language !== 'keep') {
            autoScript = await detectAndTranslateScript({
              referenceVideoUrl: input.referenceVideoUrl,
              targetLanguage: input.voiceReplacement.language,
              workDir,
              stamp,
            });
            input.voiceReplacement.script = autoScript.translatedText;
          } else if (input.voiceReplacement.voiceId || input.voiceReplacement.voiceAudioUrl) {
            // 保持语言 + 有音色样本：识别原台词（不翻译），后续用复刻音色合成。
            autoScript = await detectAndTranslateScript({
              referenceVideoUrl: input.referenceVideoUrl,
              targetLanguage: 'keep',
              workDir,
              stamp,
            });
            input.voiceReplacement.script = autoScript.translatedText;
          }
        }

        // 需要 TTS 合成的情形：手填了台词，或换语言（上面已自动翻译），
        // 或保持语言但有音色样本（上面已自动识别原台词）。
        const hasCloneVoice = Boolean(input.voiceReplacement.voiceId || input.voiceReplacement.voiceAudioUrl);
        const needsSynthesis = Boolean(input.voiceReplacement.script)
          || input.voiceReplacement.language !== 'keep'
          || hasCloneVoice;
        if (needsSynthesis) {
          if (!input.voiceReplacement.script) {
            throw new RequestValidationError(
              'AI 换声需要目标台词：请直接填写台词；换语言时留空会自动识别并翻译原视频台词。',
              400,
            );
          }

          // 解析复刻音色：优先用前端上传样本后已创建好的 voiceId；
          // voiceId 缺失（旧任务/直接调 API）时用样本公网地址现场复刻。
          let voiceId = isCloneVoiceId(input.voiceReplacement.voiceId)
            ? input.voiceReplacement.voiceId as string
            : '';
          if (!voiceId) {
            if (!input.voiceReplacement.voiceAudioUrl) {
              throw new RequestValidationError(
                '请先上传一段 10~20 秒的清晰人声样本用于声音复刻（无背景音乐、无其他人声）。',
                400,
              );
            }
            const enrolled = await enrollCloneVoice({
              audioUrl: input.voiceReplacement.voiceAudioUrl,
              prefix: buildCloneVoicePrefix(),
            });
            voiceId = enrolled.voiceId;
            input.voiceReplacement.voiceId = voiceId;
          }

          let synth;
          try {
            synth = await synthesizeVoice({ text: input.voiceReplacement.script, voice: voiceId });
          } catch (error) {
            // 复刻音色长期未用可能被清理：合成报「音色不可用」且手上还有样本公网地址时，重新复刻一次再合成。
            if (isCloneVoiceUnavailableError(error) && input.voiceReplacement.voiceAudioUrl) {
              console.warn(`[video-clone-seedance-bff] clone voice ${voiceId} unavailable, re-enrolling from sample ...`);
              const reEnrolled = await enrollCloneVoice({
                audioUrl: input.voiceReplacement.voiceAudioUrl,
                prefix: buildCloneVoicePrefix(),
              });
              voiceId = reEnrolled.voiceId;
              input.voiceReplacement.voiceId = voiceId;
              synth = await synthesizeVoice({ text: input.voiceReplacement.script, voice: voiceId });
            } else {
              throw error;
            }
          }

          const audioAsset = saveLocalAsset(`voice_${input.voiceReplacement.language}.mp3`, 'audio/mpeg', Buffer.from(synth!.audioBase64, 'base64'));
          // 生成需要公网地址：本地 URL 在没隧道时会抛 503 提示用户启动隧道。
          const audioPublicUrl = rewriteLocalAssetUrl(publicAssetUrl(audioAsset));
          input.voiceReplacement.audioUrl = audioPublicUrl;
          voiceAudioKind = 'tts';

          // 配音时长驱动成片时长：按合成音频实际秒数对齐生成时长（4~15s），保证嘴型不被拉伸/压缩。
          const audioDuration = await probeDuration(audioAsset.filePath);
          if (audioDuration && audioDuration >= 2) {
            const aligned = Math.min(15, Math.max(4, Math.round(audioDuration)));
            if (aligned !== input.durationSeconds) {
              console.log(`[video-clone-seedance-bff] voice audio dur=${audioDuration.toFixed(2)}s -> align generation duration ${input.durationSeconds}->${aligned}`);
              input.durationSeconds = aligned;
            }
          }
          console.log(`[video-clone-seedance-bff] voice synthesized -> provider=${synth!.provider} voiceId=${voiceId} audio=${audioAsset.fileName} audioDur=${audioDuration?.toFixed(2) ?? '?'}s`);
        }
      }

        const workDir = path.join(config.assetStorageDir, '.speech-work');
        await fs.mkdir(workDir, { recursive: true });
        const stamp = crypto.randomUUID();
        const sourcePath = path.join(workDir, `${stamp}-source.mp4`);
        const silentPath = path.join(workDir, `${stamp}-silent.mp4`);
        const audioPath = path.join(workDir, `${stamp}-source.m4a`);
        let sourceAudioFileName: string | undefined;
        try {
          await resolveLocalOrDownload(input.referenceVideoUrl, sourcePath);
          await stripVideoAudio(sourcePath, silentPath);
          if (voiceAudioKind !== 'tts' && await extractOriginalAudio(sourcePath, audioPath)) {
            const audioAsset = saveLocalAsset(`source_${stamp}.m4a`, 'audio/mp4', await fs.readFile(audioPath));
            sourceAudioFileName = path.basename(audioAsset.filePath);
            if (input.voiceReplacement.enabled && input.voiceReplacement.language === 'keep') {
              const audioDuration = await probeDuration(audioPath);
              if (audioDuration && audioDuration >= 2) {
                input.durationSeconds = Math.min(15, Math.max(4, Math.round(audioDuration)));
              }
            }
          }
          const silentAsset = saveLocalAsset(`silent_${stamp}.mp4`, 'video/mp4', await fs.readFile(silentPath));
          input.referenceVideoUrl = rewriteLocalAssetUrl(publicAssetUrl(silentAsset));
        } finally {
          await Promise.all([sourcePath, silentPath, audioPath].map((file) => fs.rm(file, { force: true }).catch(() => {})));
        }

      // 参考「图」和参考「视频」都资产化进真人槽位（image1..N + video1）；仅真人模式开启时下发。
      const conversionSlots = input.realPersonMode
        && (input.imageUrls.length > 0 || Boolean(input.referenceVideoUrl))
        ? buildConversionSlots(input.imageUrls.length, 1)
        : undefined;
      // 提交 CPRT 前把本地素材镜像到 COS（国内节点），避免 Ark/TOS 从隧道下载超时；失败回退隧道地址。
      input.imageUrls = await Promise.all(input.imageUrls.map((url) => mirrorAssetUrlToCOS(url)));
      input.referenceVideoUrl = await mirrorAssetUrlToCOS(input.referenceVideoUrl);
      if (input.voiceReplacement?.audioUrl) {
        input.voiceReplacement.audioUrl = await mirrorAssetUrlToCOS(input.voiceReplacement.audioUrl);
      }
      if (input.backgroundReplacement?.imageUrl) {
        input.backgroundReplacement.imageUrl = await mirrorAssetUrlToCOS(input.backgroundReplacement.imageUrl);
      }
        const task = await createMultimodalVideoTask({
        model: input.model,
        prompt: input.prompt,
        resolution: input.resolution,
        durationSeconds: input.durationSeconds,
        ratio: input.ratio,
        imageUrls: input.imageUrls,
        videoUrls: [input.referenceVideoUrl],
          voiceReplacement: { ...input.voiceReplacement, enabled: voiceAudioKind === 'tts' },
        backgroundReplacement: input.backgroundReplacement,
        realPersonMode: input.realPersonMode,
        conversionSlots,
      });
        if (sourceAudioFileName) {
          recordSourceAudio(task.taskId, sourceAudioFileName);
        }

      console.log(`[video-clone-seedance-bff] start_clone_job -> jobId=${task.taskId} status=${task.status} model=${input.model} resolution=${input.resolution} duration=${input.durationSeconds} ratio=${input.ratio} realPersonMode=${input.realPersonMode} images=${input.imageUrls.length} slots=${conversionSlots ? conversionSlots.join('|') : '(none)'}`);
      return {
        jobId: task.taskId,
        taskId: task.taskId,
        status: task.status,
        model: input.model,
        pointCost,
        // 自动识别并翻译出来的台词，返回给前端展示，方便用户确认/微调后重跑。
        voiceAutoScript: autoScript || null,
        // 生成阶段合成好的配音（公网地址）：tts 时 finalize 会强制把它覆盖进成片音轨。
        voiceAudioUrl: input.voiceReplacement.audioUrl || null,
          // 'tts' = 复刻音色配音；原声仅在完成后由服务端恢复，不发送给模型。
        voiceAudioKind,
        // 本次使用的复刻音色 ID（可能是现场复刻或失效后重新复刻的），前端回写保存。
        voiceId: input.voiceReplacement.voiceId || null,
      };
    }

    case 'create_clone_voice': {
      // 声音复刻：前端上传样本（走 /api/assets）后，拿样本公网地址即时创建专属音色。
      rewriteBodyAssetUrls(body, ['audioUrl']);
      const audioUrl = requireHttpsUrl(body, 'audioUrl');
      const prefix = String(body.prefix || '').trim() || buildCloneVoicePrefix();
      const enrolled = await enrollCloneVoice({ audioUrl, prefix });
      console.log(`[video-clone-seedance-bff] create_clone_voice -> voiceId=${enrolled.voiceId} target=${enrolled.targetModel}`);
      return {
        voiceId: enrolled.voiceId,
        targetModel: enrolled.targetModel,
        audioUrl,
      };
    }

    case 'preview_voice': {
      // 复刻音色试听：用该音色合成一句对应语种的固定短词，直接回 base64（不落盘、不计入生成账单）。
      const rawVoiceId = requireString(body, 'voiceId');
      if (!isCloneVoiceId(rawVoiceId)) {
        throw new RequestValidationError('voiceId 不是有效的复刻音色 ID。', 400);
      }
      const language = String(body.language || 'keep').trim();
      if (!isBailianSpeechLanguageSupported(language)) {
        throw new RequestValidationError(`暂不支持该试听语种：${language}`, 400);
      }
      let voiceId = rawVoiceId;
      rewriteBodyAssetUrls(body, ['voiceAudioUrl']);
      const voiceAudioUrl = body.voiceAudioUrl ? requireHttpsUrl(body, 'voiceAudioUrl') : '';
      let speech;
      try {
        speech = await synthesizeSpeech({
          text: previewTextForLanguage(language),
          voice: voiceId,
          format: 'mp3',
          sampleRate: 24000,
        });
      } catch (error) {
        // 音色失效且有样本：重新复刻后再试听一次，并把新 voiceId 带回前端。
        if (isCloneVoiceUnavailableError(error) && voiceAudioUrl) {
          const reEnrolled = await enrollCloneVoice({ audioUrl: voiceAudioUrl, prefix: buildCloneVoicePrefix() });
          voiceId = reEnrolled.voiceId;
          speech = await synthesizeSpeech({
            text: previewTextForLanguage(language),
            voice: voiceId,
            format: 'mp3',
            sampleRate: 24000,
          });
        } else {
          throw error;
        }
      }
      console.log(`[video-clone-seedance-bff] preview_voice -> voiceId=${voiceId} language=${language}`);
      return {
        voiceId,
        language,
        audioBase64: speech.audioBase64,
      };
    }

    case 'get_clone_job': {
      const taskId = requireString(body, 'jobId');
      const task = await getMultimodalVideoTask(taskId);
      // finalize 产生的最终成片（已替换为复刻音色配音）优先返回：
      // CPRT 记录里的 videoUrl 是音轨未替换的原始成片。
        let finalUrl = task.videoUrl ? finalizedVideoUrlForJob(taskId) : undefined;
          if (task.status === 'completed' && task.videoUrl && !finalUrl && (sourceAudioByJobId.has(taskId) || isTokendanceTask(taskId))) {
          try {
            finalUrl = await restoreSourceAudioForJob(taskId, task.videoUrl);
          } catch (error) {
            console.error(`[video-clone-seedance-bff] restore source audio jobId=${taskId} failed:`, error);
              throw new Error('视频已生成，但保存成片或恢复原视频音轨失败，请稍后重新查询任务。');
          }
        }
      console.log(`[video-clone-seedance-bff] get_clone_job jobId=${taskId} -> status=${task.status} videoUrl=${finalUrl ? 'finalized' : task.videoUrl ? 'yes' : 'no'} error=${task.errorMessage || '(none)'}`);
      return {
        jobId: task.taskId,
        taskId: task.taskId,
        status: task.status,
        videoUrl: finalUrl || task.videoUrl,
          originalVideoUrl: task.videoUrl,
        errorMessage: task.errorMessage,
      };
    }

    /**
     * 兜底换声：当成片音轨没被模型换成目标语言时，用「生成阶段已经合成好的配音」
     * 直接覆盖音轨。画面一帧不动（视频流 copy），只换声音，
     * 因此成片音频一定是目标语言；嘴型仍由生成阶段的对口型保证。
     */
    case 'mux_generated_audio': {
      rewriteBodyAssetUrls(body, ['videoUrl', 'audioUrl']);
      const videoSourceUrl = requireHttpsUrl(body, 'videoUrl');
      const audioSourceUrl = requireHttpsUrl(body, 'audioUrl');

      const workDir = path.join(config.assetStorageDir, '.speech-work');
      await fs.mkdir(workDir, { recursive: true });
      const stamp = crypto.randomUUID();
      const videoPath = path.join(workDir, `${stamp}-mux-src.mp4`);
      const audioPath = path.join(workDir, `${stamp}-mux-voice.mp3`);
      const outputPath = path.join(workDir, `${stamp}-muxed.mp4`);

      try {
        await downloadToFile(videoSourceUrl, videoPath);
        await downloadToFile(audioSourceUrl, audioPath);

        const videoDuration = await probeDuration(videoPath);
        const audioDuration = await probeDuration(audioPath);
        // 配音比画面长就整体加速，避免尾部拖尾。
        const tempo = videoDuration && audioDuration && videoDuration > 0
          ? Number((audioDuration / videoDuration).toFixed(4))
          : 1;

        await muxAudioIntoVideo({ videoPath, audioPath, outputPath, audioTempo: tempo });

        const asset = saveLocalAsset(`dubbed_${stamp}.mp4`, 'video/mp4', await fs.readFile(outputPath));
        console.log(`[video-clone-seedance-bff] mux_generated_audio -> videoDur=${videoDuration?.toFixed(2) ?? '?'} audioDur=${audioDuration?.toFixed(2) ?? '?'} tempo=${tempo}`);
        return {
          videoUrl: publicAssetUrl(asset),
          audioDurationSeconds: audioDuration,
          videoDurationSeconds: videoDuration,
          audioTempo: tempo,
        };
      } finally {
        await fs.rm(videoPath, { force: true }).catch(() => {});
        await fs.rm(audioPath, { force: true }).catch(() => {});
        await fs.rm(outputPath, { force: true }).catch(() => {});
      }
    }

    /**
     * 套用参考视频的运镜：把参考视频的镜头抖动轨迹搬到成片上。
     * 模型天生倾向输出平滑画面，提示词压不住时用它事后补回真实的手持晃动。
     */
    case 'apply_camera_shake': {
      rewriteBodyAssetUrls(body, ['referenceVideoUrl', 'videoUrl']);
      const referenceVideoUrl = requireHttpsUrl(body, 'referenceVideoUrl');
      const targetVideoUrl = requireHttpsUrl(body, 'videoUrl');

      const workDir = path.join(config.assetStorageDir, '.speech-work');
      await fs.mkdir(workDir, { recursive: true });
      const stamp = crypto.randomUUID();
      const refPath = path.join(workDir, `${stamp}-ref.mp4`);
      const targetPath = path.join(workDir, `${stamp}-target.mp4`);
      const outputPath = path.join(workDir, `${stamp}-shaken.mp4`);

      try {
        await resolveLocalOrDownload(referenceVideoUrl, refPath);
        await resolveLocalOrDownload(targetVideoUrl, targetPath);
        await applyCameraShake({
          sourceVideoPath: refPath,
          targetVideoPath: targetPath,
          outputPath,
          workDir,
        });
        const asset = saveLocalAsset(`shaken_${stamp}.mp4`, 'video/mp4', await fs.readFile(outputPath));
        console.log(`[video-clone-seedance-bff] apply_camera_shake done -> ${asset.fileName}`);
        return { videoUrl: publicAssetUrl(asset) };
      } finally {
        await fs.rm(refPath, { force: true }).catch(() => {});
        await fs.rm(targetPath, { force: true }).catch(() => {});
        await fs.rm(outputPath, { force: true }).catch(() => {});
      }
    }

    /** 生成后仅按需替换音轨，保留模型生成的原始画面。 */
    case 'finalize_video': {
      rewriteBodyAssetUrls(body, ['referenceVideoUrl', 'videoUrl', 'voiceAudioUrl']);
      const targetVideoUrl = requireHttpsUrl(body, 'videoUrl');
      // 生成阶段用百炼复刻音色合成好的配音：存在时必须强制覆盖成片音轨。
      // 即梦对 audioUrls 只做「对口型参考」，输出音轨不一定是这段音频，
      // 不覆盖就会出现「试听音色是对的、成片声音不对」的问题。
      const voiceAudioUrl = body.voiceAudioUrl ? requireHttpsUrl(body, 'voiceAudioUrl') : '';
      if (!voiceAudioUrl) {
        return { videoUrl: targetVideoUrl, audioReplaced: false, audioTempo: 1 };
      }

      const workDir = path.join(config.assetStorageDir, '.speech-work');
      await fs.mkdir(workDir, { recursive: true });
      const stamp = crypto.randomUUID();
      const targetPath = path.join(workDir, `${stamp}-target.mp4`);
      const dubPath = path.join(workDir, `${stamp}-dub.mp3`);
      const muxedPath = path.join(workDir, `${stamp}-final.mp4`);

      try {
        await resolveLocalOrDownload(targetVideoUrl, targetPath);
        // Copy the original video stream unchanged while replacing only its audio track.
        await resolveLocalOrDownload(voiceAudioUrl, dubPath);
        const videoDuration = await probeDuration(targetPath);
        const audioDuration = await probeDuration(dubPath);
        const audioTempo = videoDuration && audioDuration && audioDuration > videoDuration * 1.03
          ? Number((audioDuration / videoDuration).toFixed(4))
          : 1;
        await muxAudioIntoVideo({
          videoPath: targetPath,
          audioPath: dubPath,
          outputPath: muxedPath,
          audioTempo,
        });
        console.log(`[video-clone-seedance-bff] finalize_video dubbed -> videoDur=${videoDuration?.toFixed(2) ?? '?'} audioDur=${audioDuration?.toFixed(2) ?? '?'} tempo=${audioTempo}`);

        const asset = saveLocalAsset(`finalized_${stamp}.mp4`, 'video/mp4', await fs.readFile(muxedPath));
        const finalUrl = publicAssetUrl(asset);
        // 记录 jobId -> 最终成片素材，刷新页面/重新查询时 get_clone_job 返回这版。
        const jobId = typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : '';
        if (jobId) {
          recordFinalizedVideo(jobId, path.basename(asset.filePath));
        }
        console.log(`[video-clone-seedance-bff] finalize_video done -> ${asset.fileName} audioReplaced=true${jobId ? ` jobId=${jobId}` : ''}`);
        return {
          videoUrl: finalUrl,
          audioReplaced: true,
          audioTempo,
        };
      } finally {
        await fs.rm(targetPath, { force: true }).catch(() => {});
        await fs.rm(dubPath, { force: true }).catch(() => {});
        await fs.rm(muxedPath, { force: true }).catch(() => {});
      }
    }

    case 'swap_video_audio': {
      rewriteBodyAssetUrls(body, ['videoUrl', 'voiceAudioUrl']);
      const videoSourceUrl = requireHttpsUrl(body, 'videoUrl');
      const language = String(body.language || 'keep').trim();
      if (!isBailianSpeechLanguageSupported(language)) {
        const options = Object.keys(BAILIAN_SPEECH_LANGUAGE_LABELS).join(' / ');
        throw new RequestValidationError(`百炼语音暂不支持语种「${language}」。可选：${options}`, 400);
      }
      // TTS 是纯合成（不会「听懂」原音频再翻译），台词必填；换语言时台词需先翻成目标语言。
      const script = String(body.script || '').trim().slice(0, 3000);
      if (!script) {
        throw new RequestValidationError(
          '请填写要合成的台词（换语言时请填写已翻译成目标语言的台词）。',
          400,
        );
      }
      // 复刻音色 ID：必填；可同时带样本地址 voiceAudioUrl 用于音色失效时重新复刻。
      const rawVoiceId = String(body.voiceId || '').trim();
      if (!isCloneVoiceId(rawVoiceId)) {
        throw new RequestValidationError('缺少复刻音色 voiceId：请先上传人声样本完成声音复刻。', 400);
      }
      const voiceAudioUrl = body.voiceAudioUrl ? requireHttpsUrl(body, 'voiceAudioUrl') : '';

      const workDir = path.join(config.assetStorageDir, '.speech-work');
      await fs.mkdir(workDir, { recursive: true });
      const stamp = crypto.randomUUID();
      const videoPath = path.join(workDir, `${stamp}-src.mp4`);
      const newAudioPath = path.join(workDir, `${stamp}-voice.mp3`);
      const outputPath = path.join(workDir, `${stamp}-dubbed.mp4`);

      try {
        console.log(`[video-clone-seedance-bff] swap_video_audio -> language=${language}(${bailianSpeechLanguageLabel(language)}) voiceId=${rawVoiceId} script=${script.length}chars`);
        await downloadToFile(videoSourceUrl, videoPath);

        let voiceId = rawVoiceId;
        let speech;
        try {
          speech = await synthesizeSpeech({ text: script, voice: voiceId, format: 'mp3', sampleRate: 24000 });
        } catch (error) {
          if (isCloneVoiceUnavailableError(error) && voiceAudioUrl) {
            const reEnrolled = await enrollCloneVoice({ audioUrl: voiceAudioUrl, prefix: buildCloneVoicePrefix() });
            voiceId = reEnrolled.voiceId;
            speech = await synthesizeSpeech({ text: script, voice: voiceId, format: 'mp3', sampleRate: 24000 });
          } else {
            throw error;
          }
        }
        await fs.writeFile(newAudioPath, Buffer.from(speech.audioBase64, 'base64'));

        const videoDuration = await probeDuration(videoPath);
        const audioDuration = await probeDuration(newAudioPath);
        const audioTempo = videoDuration && audioDuration && audioDuration > videoDuration * 1.03
          ? audioDuration / videoDuration
          : 1;

        await muxAudioIntoVideo({ videoPath, audioPath: newAudioPath, outputPath, audioTempo });

        const audioAsset = saveLocalAsset(`dub_${language}.mp3`, 'audio/mpeg', await fs.readFile(newAudioPath));
        const videoAsset = saveLocalAsset(`dubbed_${language}.mp4`, 'video/mp4', await fs.readFile(outputPath));

        console.log(`[video-clone-seedance-bff] swap_video_audio done -> voiceId=${voiceId} video=${videoAsset.fileName} audio=${audioAsset.fileName} videoDur=${videoDuration} audioDur=${audioDuration} tempo=${audioTempo.toFixed(3)}`);
        return {
          videoUrl: publicAssetUrl(videoAsset),
          audioUrl: publicAssetUrl(audioAsset),
          voiceId,
          videoDurationSeconds: videoDuration,
          audioDurationSeconds: audioDuration,
          audioTempo,
        };
      } finally {
        for (const file of [videoPath, newAudioPath, outputPath]) {
          await fs.rm(file, { force: true }).catch(() => {});
        }
      }
    }

    default:
      throw new RequestValidationError(`Unknown action: ${action || '(empty)'}`, 404);
  }
}

async function drainRequestBody(req: IncomingMessage, maxBytes = 128 * 1024 * 1024): Promise<void> {
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) {
      return;
    }
  }
}

function normalizeRouteUrl(req: IncomingMessage): string {
  const rawUrl = String(req.url || '').split('?')[0] || '/';
  const standalonePrefix = '/standalone/video-clone-seedance-v2';
  if (rawUrl.startsWith(standalonePrefix)) {
    return rawUrl.slice(standalonePrefix.length) || '/';
  }
  return rawUrl;
}

const server = createServer(async (req, res) => {
  try {
    const routeUrl = normalizeRouteUrl(req);
    console.log(`[video-clone-seedance-bff] ${req.method} ${routeUrl}`);
    if (req.method === 'GET' && routeUrl === '/api/health') {
      const payload = await dispatch({ action: 'health' });
      sendJson(res, 200, { success: true, data: payload, message: '' });
      return;
    }

    if (req.method === 'POST' && (routeUrl === '/api/run' || routeUrl === '/api/execute/run')) {
      const body = await readJsonBody(req);
      console.log(`[video-clone-seedance-bff] action=${String(body.action || '(empty)')}`);
      const payload = await dispatch(body);
      sendJson(res, 200, { success: true, data: payload, message: '' });
      return;
    }

    if (req.method === 'POST' && (routeUrl === '/api/assets' || routeUrl === '/api/execute/local-assets')) {
      // 上传只负责把素材缓存在本地，不再强依赖 HTTPS 隧道：
      // 有隧道时返回公网 URL（可直接用于生成），没隧道返回本地素材服务 URL（预览/换声可用，
      // 生成时 BFF 会自动把本地 URL 改写成隧道 URL，隧道起了就能生成，无需重新上传）。
      const rawFileName = String(req.headers['x-file-name'] || 'asset');
      let fileName = rawFileName;
      try {
        fileName = decodeURIComponent(rawFileName);
      } catch {
        fileName = rawFileName;
      }
      const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';', 1)[0];
      const contents = await readBinaryBody(req);
      const asset = saveLocalAsset(fileName, contentType, contents);
      const tunnelReady = /^https:\/\//i.test(getPublicAssetBaseUrl());
      sendJson(res, 200, {
        success: true,
        data: { url: publicAssetUrl(asset), fileName: asset.fileName, tunnelReady },
        message: '',
      });
      return;
    }

    sendJson(res, 404, { success: false, data: null, message: `Path not found: ${req.method} ${req.url || ''}` });
  } catch (error) {
    const failedRoute = String(req.url || '');
    if (error instanceof RequestValidationError) {
      // 校验失败此前是静默返回的，导致前端只看到笼统的“生成失败”，无法定位。
      console.error(
        `[video-clone-seedance-bff] rejected ${req.method} ${failedRoute} -> ${error.status}: ${error.message}`,
      );
      sendJson(res, error.status, { success: false, data: null, message: error.message });
      return;
    }
    console.error('[video-clone-seedance-bff] request error', error);
    sendJson(res, 500, {
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Unknown BFF error.',
    });
  }
});

const assetServer = createServer((req, res) => {
  const routeUrl = String(req.url || '').split('?')[0] || '/';
  if (req.method !== 'GET' || !routeUrl.startsWith('/assets/')) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const asset = findLocalAsset(decodeURIComponent(routeUrl.slice('/assets/'.length)));
  if (!asset) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('Content-Length', String(statSync(asset.filePath).size));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  createReadStream(asset.filePath).pipe(res);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[video-clone-seedance-bff] listening on http://127.0.0.1:${config.port}`);
});

assetServer.listen(config.assetPort, '127.0.0.1', () => {
  console.log(`[video-clone-seedance-assets] listening on http://127.0.0.1:${config.assetPort}`);
});

function shutdown(signal: string): void {
  console.log(`[video-clone-seedance-bff] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  assetServer.close();
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
