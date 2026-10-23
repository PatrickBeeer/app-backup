import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Copy, CheckCircle2, TrendingUp, Zap, ShieldAlert, UploadCloud, FileText, Video, X, BookOpen, Sparkles, UserCircle, Loader2 } from 'lucide-react';
import * as mammoth from 'mammoth';
import { fetchWithAuthFallback } from '../lib/authHeaders';
import { getLLMExecuteEndpoint } from '../lib/llmExecuteEndpoint';
import { compressVideo } from '../lib/videoCompressor';

function maskInlineData(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => maskInlineData(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const cloned: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      ['api_key', 'apiKey', 'provider_api_key', 'providerApiKey'].includes(k) &&
      typeof v === 'string'
    ) {
      const tail = v.length > 6 ? v.slice(-6) : v;
      cloned[k] = `[hidden:${tail}]`;
      continue;
    }

    if (
      k === 'data' &&
      typeof v === 'string' &&
      value.mimeType &&
      String(value.mimeType).includes('/')
    ) {
      cloned[k] = `[base64 omitted: ${v.length} chars]`;
      continue;
    }
    cloned[k] = maskInlineData(v);
  }

  return cloned;
}

function extractTextFromGeminiPayload(payload: any): string {
  const candidates = payload?.candidates;
  if (Array.isArray(candidates)) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const textParts = parts
        .map((part: any) => (typeof part?.text === 'string' ? String(part.text).trim() : ''))
        .filter(Boolean);

      // Some models return intermediate reasoning text first and final JSON last.
      if (textParts.length > 0) {
        const prioritized = [...textParts].reverse().find((text) => {
          return (
            /^\s*[\[{]/.test(text) ||
            /```(?:json)?/i.test(text) ||
            /"titles"\s*:/i.test(text)
          );
        });

        return prioritized || textParts[textParts.length - 1];
      }
    }
  }

  if (typeof payload?.text === 'string') return payload.text;
  return '';
}

function extractBalancedJsonSlices(sourceText: string): string[] {
  const source = String(sourceText || '');
  if (!source.trim()) {
    return [];
  }

  const slices: string[] = [];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '{' && ch !== '[') {
      continue;
    }

    const stack: string[] = [ch === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let j = i + 1; j < source.length; j += 1) {
      const current = source[j];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          continue;
        }
        if (current === '"') {
          inString = false;
        }
        continue;
      }

      if (current === '"') {
        inString = true;
        continue;
      }

      if (current === '{') {
        stack.push('}');
        continue;
      }
      if (current === '[') {
        stack.push(']');
        continue;
      }

      if ((current === '}' || current === ']') && stack[stack.length - 1] === current) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = source.slice(i, j + 1).trim();
          if (candidate) {
            slices.push(candidate);
          }
          break;
        }
      }
    }
  }

  return Array.from(new Set(slices));
}

function parseLooseJSONFromText(rawText: string): any {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error('empty model response');
  }

  const candidates: string[] = [];

  const noFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (noFence) candidates.push(noFence);

  const fencedBlocks = text.match(/```(?:json)?\s*([\s\S]*?)```/gi) || [];
  for (const block of fencedBlocks) {
    const stripped = block
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    if (stripped) candidates.push(stripped);
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const objectSlice = text.slice(firstBrace, lastBrace + 1).trim();
    if (objectSlice) candidates.push(objectSlice);
  }

  candidates.push(...extractBalancedJsonSlices(text));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('model did not return valid JSON');
}

function normalizeTitleEntry(value: any): TitleIdea | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const slashParts = value.split('/').map((part) => part.trim()).filter(Boolean);
    if (slashParts.length >= 2) {
      return {
        line1: slashParts[0].slice(0, 24),
        line2: slashParts.slice(1).join(' / ').slice(0, 24),
      };
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const line1 = String(
    value.line1 ?? value.title1 ?? value.firstLine ?? value.topLine ?? value.headline1 ?? ''
  ).trim();
  const line2 = String(
    value.line2 ?? value.title2 ?? value.secondLine ?? value.bottomLine ?? value.headline2 ?? ''
  ).trim();

  if (!line1 || !line2) {
    const combined = String(value.title ?? value.headline ?? '').trim();
    if (combined) {
      const slashParts = combined.split('/').map((part) => part.trim()).filter(Boolean);
      if (slashParts.length >= 2) {
        return {
          line1: slashParts[0].slice(0, 24),
          line2: slashParts.slice(1).join(' / ').slice(0, 24),
          platform: String(value.platform || '').trim() || undefined,
        };
      }
    }
    return null;
  }

  return {
    line1: line1.slice(0, 24),
    line2: line2.slice(0, 24),
    platform: String(value.platform || '').trim() || undefined,
  };
}

function extractTitlesFromUnknownValue(root: any): TitleIdea[] {
  if (!root || typeof root !== 'object') {
    return [];
  }

  const queue: any[] = [root];
  const visited = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const candidateArrays: any[] = [];
    if (Array.isArray(current)) {
      candidateArrays.push(current);
    }
    if (Array.isArray(current.titles)) {
      candidateArrays.push(current.titles);
    }

    for (const arr of candidateArrays) {
      const normalized = arr
        .map((item: any) => normalizeTitleEntry(item))
        .filter((item: TitleIdea | null): item is TitleIdea => Boolean(item));

      if (normalized.length > 0) {
        return normalized.slice(0, 5);
      }
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return [];
}

function parseTitlesFromPlainText(rawText: string): TitleIdea[] {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\-*•\d.\)\s]+/, '').trim())
    .filter(Boolean);

  const items: TitleIdea[] = [];

  // Priority 1: explicit line1 / line2 slash format.
  for (const line of lines) {
    if (items.length >= 5) break;

    const slashParts = line.split('/').map((part) => part.trim()).filter(Boolean);
    if (slashParts.length >= 2) {
      items.push({
        line1: slashParts[0].slice(0, 24),
        line2: slashParts.slice(1).join(' / ').slice(0, 24),
      });
    }
  }

  if (items.length > 0) {
    return items.slice(0, 5);
  }

  // Priority 2: pair concise lines only, avoid paragraph-like intermediate reasoning text.
  const conciseLines = lines.filter((line) => {
    if (line.length < 4 || line.length > 24) {
      return false;
    }
    return !/[。；;，,:：]/.test(line);
  });

  for (let i = 0; i + 1 < conciseLines.length && items.length < 5; i += 2) {
    items.push({
      line1: conciseLines[i],
      line2: conciseLines[i + 1],
    });
  }

  return items;
}

interface TitleIdea {
  line1: string;
  line2: string;
  platform?: string;
}

type StyleType = 'liumang' | 'daqian' | 'custom';

const PRESET_STYLES = {
  liumang: {
    id: 'liumang',
    name: '榴芒专属',
    icon: <Zap className="w-4 h-4" />,
    description: '极客、硬核、直白。常带英文工具名，喜欢用等号、问号、引号。侧重教程指南、定性评价或引发焦虑/贪婪。',
    examples: `Midjourney v8 / 重磅全新升级
#AI能取代 / 什么岗位
用上OpenClaw = / 掌握财富密码？
神仙工具分享 / 小白也能一键部署大龙虾
Mac mini / AI时代的“矿机”
Seedream 5.0 / 快速上手指南
即梦Seedance 2.0 / 功能指南
Seedance 2.0爆火 / AI越界引担忧`
  },
  daqian: {
    id: 'daqian',
    name: '大钱专属',
    icon: <Sparkles className="w-4 h-4" />,
    description: '偏向商业认知、财富逻辑、职场焦虑与逆袭。喜欢用感叹号、问号，常用词汇：财富密码、逆袭、认知分层、黑灰产、神仙玩法、0成本。句式多为现象/问题 + 结论/方法。',
    examples: `AI时代的 / 三道斩杀线
未来五年 / 一定会被AI替代的岗位
天塌了！ / 即梦涨价了
免写提示词！ / AI带货神仙玩法
全网都养“小龙虾” / 养人不如养AI？
懂业务+指挥AI / = 王炸
人走能力留 / 企业做AI的底层逻辑
顶级创业者 / 都是“雌雄同体”
风口焦虑 / 源于能力的极度自卑
一手修行 / 一手商业
学会“AI驱动AI” / 人人都能手搓生产力
AI蒸馏三境界 / 从语料到直觉`
  },
  custom: {
    id: 'custom',
    name: '自定义风格',
    icon: <UserCircle className="w-4 h-4" />,
    description: '手动粘贴你平时用过的数据好的标题，AI 将深度模仿你的专属风格。',
    examples: ''
  }
};

export default function TitleGenerator() {
  const [apiKey, setApiKey] = useState('');
  const [activeStyle, setActiveStyle] = useState<StyleType>('liumang');
  const [referenceTitles, setReferenceTitles] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [titles, setTitles] = useState<TitleIdea[]>([]);
  const [lastRequestPayload, setLastRequestPayload] = useState<any>(null);
  const [lastResponsePayload, setLastResponsePayload] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDescriptions, setCustomDescriptions] = useState<Record<StyleType, string>>({
    liumang: PRESET_STYLES.liumang.description,
    daqian: PRESET_STYLES.daqian.description,
    custom: PRESET_STYLES.custom.description,
  });
  const [customExamples, setCustomExamples] = useState<Record<StyleType, string>>({
    liumang: PRESET_STYLES.liumang.examples,
    daqian: PRESET_STYLES.daqian.examples,
    custom: PRESET_STYLES.custom.examples,
  });

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadKey = async () => {
      const envKey = (
        (((import.meta as any)?.env?.VITE_TEXT_GEN_KEY as string | undefined)) ||
        (((import.meta as any)?.env?.VITE_GEMINI_API_KEY as string | undefined))
      )?.trim();

      if (envKey && !cancelled) {
        setApiKey(envKey);
        return;
      }

      try {
        const configUrl = 'config/keys.json';
        const res = await fetch(configUrl);
        if (!res.ok) return;
        const data = await res.json();

        const keyRecords = Array.isArray(data?.keys) ? data.keys : [];
        const key = String(
          keyRecords.find((item: any) => item?.k_gemini_text)?.k_gemini_text ||
          keyRecords.find((item: any) => item?.k_text_gen)?.k_text_gen ||
          keyRecords.find((item: any) => item?.k_147_qwen)?.k_147_qwen ||
          ''
        ).trim();

        if (!cancelled && key) {
          setApiKey(key);
        }
      } catch {
        // Ignore key preload errors; user can paste key manually.
      }
    };

    loadKey();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFile = async (selected: File) => {
    let fileToProcess = selected;

    if (selected.type.startsWith('video/') && selected.size > 20 * 1024 * 1024) {
      if (selected.size > 100 * 1024 * 1024) {
        setError('视频文件过大，请上传 100MB 以内的视频。');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      try {
        setIsCompressing(true);
        setCompressionProgress(0);
        setError(null);
        fileToProcess = await compressVideo(selected, setCompressionProgress);
      } catch (err) {
        console.error('Video compression failed:', err);
        setError('视频压缩失败，请尝试上传更小的视频。');
        setIsCompressing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      } finally {
        setIsCompressing(false);
      }
    }

    setFile(fileToProcess);
    setError(null);
    setFileData(null);
    setTextContent(null);

    // Handle .docx files
    if (fileToProcess.name.endsWith('.docx')) {
      try {
        const arrayBuffer = await fileToProcess.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setTextContent(result.value);
      } catch (err) {
        console.error('Error parsing docx:', err);
        setError('无法解析 Word 文档，请确保文件未损坏或尝试转为 txt 格式。');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    if (fileToProcess.type.startsWith('text/') || fileToProcess.name.endsWith('.md')) {
      reader.onload = (event) => setTextContent(event.target?.result as string);
      reader.readAsText(fileToProcess);
    } else if (fileToProcess.type.startsWith('video/')) {
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64Data = dataUrl.split(',')[1];
        setFileData({ mimeType: fileToProcess.type, data: base64Data });
      };
      reader.readAsDataURL(fileToProcess);
    } else {
      setError('不支持的文件格式，请上传文案(txt/md/docx)或视频(mp4/mov)。');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCompressing) return;
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isCompressing) return;
    const selected = e.dataTransfer.files?.[0];
    if (selected) processFile(selected);
  };

  const removeFile = () => {
    setFile(null);
    setFileData(null);
    setTextContent(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (!file) {
      setError('请上传视频或文案！');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setTitles([]);

    const key = apiKey.trim();
    if (!key) {
      setError('请先填写 Text Gen Key。');
      setIsGenerating(false);
      return;
    }

    setLastRequestPayload(null);
    setLastResponsePayload(null);

    try {
      const parts: any[] = [];
      let promptText = `请根据以下内容生成短视频封面标题。\n`;
      
      // Inject Style Instructions
      let hasExamples = false;
      
      if (activeStyle === 'custom' && referenceTitles.trim()) {
        hasExamples = true;
        promptText += `\n【重要指令：风格借鉴与创新】\n`;
        promptText += `以下是我平时使用的数据很好的标题示例，请你**深度分析**这些标题的句式结构、用词习惯、情绪张力和长短节奏：\n${referenceTitles}\n\n请在保留这些核心风格基因的基础上，结合当前内容进行**适度的创新和发散**，不要生搬硬套，要让人眼前一亮。\n\n`;
        if (customDescriptions.custom.trim()) {
          promptText += `风格特点补充说明：${customDescriptions.custom}\n\n`;
        }
      } else if (activeStyle !== 'custom') {
        const styleDef = PRESET_STYLES[activeStyle];
        const examples = customExamples[activeStyle].trim();
        
        if (examples) {
          hasExamples = true;
          promptText += `\n【重要指令：风格借鉴与创新】\n`;
          promptText += `你需要参考【${styleDef.name}】的风格。\n风格特点：${customDescriptions[activeStyle]}\n参考示例（斜杠前为第一行，斜杠后为第二行）：\n${examples}\n\n请深度提取上述示例的基因（如字数、标点、特殊词汇、断句方式），并在保留其核心味道的基础上，结合当前内容进行**适度的创新和发散**，不要完全照搬句式，要让人眼前一亮。\n\n`;
        } else if (customDescriptions[activeStyle].trim()) {
          promptText += `\n【重要指令：风格借鉴与创新】\n`;
          promptText += `你需要参考【${styleDef.name}】的风格。\n风格特点：${customDescriptions[activeStyle]}\n\n请结合当前内容进行**适度的创新和发散**，要让人眼前一亮。\n\n`;
        }
      }

      if (!hasExamples) {
        promptText += `\n【重要指令：多平台标题生成】\n由于没有提供具体的参考示例，请你根据文案内容，生成适用于多个不同平台（如抖音、小红书、B站、视频号等）的爆款标题，每个标题需要适应不同平台的调性，并在返回结果中注明适用的平台。\n\n`;
      }

      promptText += `\n【输出格式要求】只返回一个 JSON 对象，不要返回分析过程、中间草稿或额外解释文字。JSON 结构必须为 {"titles":[{"line1":"...","line2":"...","platform":"..."}]}。\n`;

      if (textContent) {
        promptText += `文案内容：\n${textContent}\n`;
      }
      parts.push({ text: promptText });

      if (fileData) {
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.data
          }
        });
      }

      const requestBody = {
        model: 'gemini-3-flash-preview',
        api_key: key,
        contents: { parts },
        config: {
          systemInstruction: `你是一位拥有百万粉丝的科技数码自媒体标题专家，擅长创作具有“科技老大哥”风格的短视频封面标题。你的风格稳重、硬核，且能精准捕捉技术趋势与财富机会。

# Style Rules
1. 结构固定：标题必须分为两行。
   - 第一行：突出核心工具、技术名词或核心现象。
   - 第二行：提供价值主张、情绪冲击或结果预测。
2. 用词特征：
   - 常用词汇：财富密码、神仙工具、一键部署、深度解析、重磅升级、小白也能、一夜塌房、引担忧、快速上手。
   - 语气：直白、略带商业洞察感、不废话。
3. 字数控制：【极简短促】每行严格控制在 4-8 个汉字以内，越精炼越好，拒绝冗长，确保在封面上能以超大字体带来视觉冲击。
4. 拒绝标题党但保留钩子：标题要基于事实，但要用“财富”、“替代”、“深度”等词汇吸引点击。
5. 中英混排：涉及工具名时保留英文，专业术语要显得专业（如 LLM, GPU, V8 等）。
6. 提炼金句：在写标题时，如果文案或视频中包含极具传播力、共鸣感或哲理的“金句”，可以将其提炼并作为标题的一部分。
7. 【最高优先级】：如果用户指定了特定风格（如榴芒专属、大钱专属或自定义参考），请在提取该风格基因（如字数、标点、特殊词汇、断句方式）的基础上，务必进行适度的创新与升华。不要完全照搬原有句式，要结合当前内容产生奇妙的化学反应，既有原风格的“味道”，又有意想不到的“新意”。可以适度打破上述 1-6 条的限制。

# Workflow
当用户上传了【视频/文案】时，请深度理解内容，并根据以上风格提供 5 个不同的封面标题选项。`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              titles: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    line1: {
                      type: 'STRING',
                      description: '标题第一行（突出核心工具/技术/现象）',
                    },
                    line2: {
                      type: 'STRING',
                      description: '标题第二行（提供价值/情绪/结果）',
                    },
                    platform: {
                      type: 'STRING',
                      description: '适用的平台（如抖音、小红书、B站、视频号等）。如果没有提供示例，请务必填写此项以区分不同平台的调性。',
                    }
                  },
                  required: ['line1', 'line2'],
                },
              },
            },
            required: ['titles'],
          },
        },
        task: 'text_gen',
        tier: 'normal',
        standalone_suite: 's_tts',
        standalone_tool: 'title-generator',
      };

      setLastRequestPayload(maskInlineData(requestBody));

      const attempts: any[] = [];
      let envelope: any = {};
      let payload: any = null;
      let success = false;

      const response = await fetchWithAuthFallback(getLLMExecuteEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Standalone-Suite': 's_tts',
          'X-Standalone-Tool': 'title-generator',
        },
        credentials: 'same-origin',
        body: JSON.stringify(requestBody),
      });

      const raw = await response.text();
      try {
        envelope = raw ? JSON.parse(raw) : {};
      } catch {
        envelope = {};
      }

      payload = envelope?.data ?? envelope;
      const failed = !response.ok || envelope?.success === false || payload?.error;
      success = !failed;

      attempts.push({
        mode: 'non_stream_only',
        ok: !failed,
        httpStatus: response.status,
        eventCount: 0,
        lastEvent: 'message',
        message: failed
          ? String(payload?.error?.message || envelope?.message || `生成失败 (HTTP ${response.status})`)
          : 'success',
        lastMessage: envelope,
      });

      const normalizedAttempts = attempts.map((item) => {
        if (item.ok) return item;

        const isTimeoutLike =
          item.httpStatus === 524 ||
          String(item.message || '').includes('Gateway Timeout') ||
          String(item.message || '').includes('context deadline exceeded');

        return {
          ...item,
          level: isTimeoutLike ? 'warning' : 'error',
        };
      });

      setLastResponsePayload(maskInlineData({
        attempts: normalizedAttempts,
        selectedResult: success ? 'success' : 'failed',
      }));

      if (!success) {
        const statusCode = Number(attempts[attempts.length - 1]?.httpStatus || 500);
        const rawMessage = String(
          payload?.error?.message ||
          envelope?.message ||
          attempts[attempts.length - 1]?.message ||
          `生成失败 (HTTP ${statusCode})`
        );
        if (statusCode === 401 || rawMessage.includes('认证令牌')) {
          throw new Error('登录状态已失效，请先登录主站后重试。');
        }
        if (rawMessage.includes('context deadline exceeded') || rawMessage.includes('Gateway Timeout') || statusCode === 524) {
          throw new Error('模型处理超时，请重试或减少输入视频长度后再试。');
        }
        throw new Error(rawMessage);
      }

      const modelText = extractTextFromGeminiPayload(payload);

      let normalizedTitles: TitleIdea[] = [];
      try {
        const parsed = parseLooseJSONFromText(modelText);
        normalizedTitles = extractTitlesFromUnknownValue(parsed);
      } catch {
        // Fall through to payload/plain-text fallback.
      }

      if (normalizedTitles.length === 0) {
        normalizedTitles = extractTitlesFromUnknownValue(payload);
      }

      if (normalizedTitles.length === 0) {
        normalizedTitles = parseTitlesFromPlainText(modelText);
      }

      if (normalizedTitles.length > 0) {
        setTitles(normalizedTitles.slice(0, 5));
        return;
      }

      throw new Error('生成的格式不正确');
    } catch (err) {
      console.error('Generation Error:', err);
      setError('生成失败，请稍后再试或检查网络连接。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (title: TitleIdea, index: number) => {
    const textToCopy = `${title.line1}\n${title.line2}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-12">
      {/* Header */}
      <header className="text-center space-y-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-white"
        >
          爆款封面标题生成器
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-zinc-400 max-w-2xl mx-auto text-sm md:text-base leading-relaxed"
        >
          上传视频或文案，AI 深度拆解逻辑，一键生成自带流量的爆款封面标题。
        </motion.p>
      </header>

      {/* Input Section */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-2xl space-y-6"
      >
        {/* Style Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-300 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            选择标题风格
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
            {(Object.keys(PRESET_STYLES) as StyleType[]).map((styleKey) => {
              const style = PRESET_STYLES[styleKey];
              const isActive = activeStyle === styleKey;
              return (
                <button
                  key={styleKey}
                  onClick={() => setActiveStyle(styleKey)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {style.icon}
                  {style.name}
                </button>
              );
            })}
          </div>
          
          {/* Style Description Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStyle}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400"
            >
              <div className="flex flex-col gap-2">
                <label className="text-zinc-300 font-bold text-xs">风格特点：</label>
                <textarea
                  value={customDescriptions[activeStyle]}
                  onChange={(e) => setCustomDescriptions(prev => ({ ...prev, [activeStyle]: e.target.value }))}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none"
                  rows={2}
                />
              </div>
              {activeStyle !== 'custom' && (
                <details className="mt-2 text-xs font-mono text-zinc-500 border-t border-zinc-800/50 pt-2 group">
                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300 select-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
                    查看并编辑示例库 (可选)
                  </summary>
                  <div className="mt-2 pl-3 border-l-2 border-zinc-800/50">
                    <textarea
                      value={customExamples[activeStyle]}
                      onChange={(e) => setCustomExamples(prev => ({ ...prev, [activeStyle]: e.target.value }))}
                      placeholder="可选：粘贴你的参考示例。如果不提供示例，AI将为你生成多平台（抖音、小红书、B站等）的标题。"
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y min-h-[150px]"
                    />
                  </div>
                </details>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* File Upload Zone */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300 flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-emerald-500" />
            上传素材
          </label>
          <div 
            className={`relative border-2 border-dashed rounded-xl p-6 transition-all text-center ${
              isDragging 
                ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' 
                : file 
                  ? 'border-emerald-500/50 bg-emerald-500/5' 
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="video/mp4,video/quicktime,video/webm,text/plain,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            
            {!file && !isCompressing ? (
              <div className="flex flex-col items-center gap-3 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <UploadCloud className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">点击或拖拽上传视频/文案</p>
                  <p className="text-xs text-zinc-500 mt-1">支持 .mp4, .mov, .txt, .md, .docx (视频超过20MB将自动压缩)</p>
                </div>
              </div>
            ) : isCompressing ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <div className="space-y-2 w-full max-w-xs">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">正在压缩视频...</span>
                    <span className="text-emerald-400 font-medium">{compressionProgress}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                      style={{ width: `${compressionProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">视频文件较大，正在本地进行压缩处理</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-md">
                    {file.type.startsWith('video/') ? <Video className="w-5 h-5 text-blue-400" /> : <FileText className="w-5 h-5 text-emerald-400" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-zinc-200 truncate max-w-[200px] md:max-w-[300px]">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeFile(); }}
                  className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Custom Reference Titles Zone (Only visible when 'custom' style is selected) */}
        <AnimatePresence>
          {activeStyle === 'custom' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-2 border-t border-zinc-800/50 overflow-hidden"
            >
              <label htmlFor="reference" className="block text-sm font-medium text-zinc-300 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-emerald-500" />
                自定义风格参考
              </label>
              <textarea
                id="reference"
                value={referenceTitles}
                onChange={(e) => setReferenceTitles(e.target.value)}
                placeholder="可选：粘贴你平时用过的数据好的标题，每行一个。AI 将深度模仿你的专属风格。如果不提供示例，AI将为你生成多平台标题..."
                className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all resize-none"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            拒绝标题党，保留钩子
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !file}
            className="relative overflow-hidden group bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Wand2 className="w-4 h-4" />
                  </motion.div>
                  正在生成...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  生成爆款标题
                </>
              )}
            </span>
            {/* Button Hover Effect */}
            <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
          </button>
        </div>
        
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-red-400 text-sm mt-2 bg-red-950/30 p-3 rounded-lg border border-red-900/50 overflow-hidden"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* Results Section */}
      <AnimatePresence>
        {titles.length > 0 && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h2>生成结果 (5个选项)</h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {titles.map((title, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-emerald-500/50 transition-colors flex flex-col justify-between min-h-[160px]"
                >
                  <div className="space-y-2 pr-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-mono text-zinc-500">OPTION 0{index + 1}</div>
                      {title.platform && (
                        <div className="text-xs font-medium px-2 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                          {title.platform}
                        </div>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide leading-tight">
                      {title.line1}
                    </h3>
                    <h3 className="text-xl font-bold text-emerald-400 tracking-wide leading-tight">
                      {title.line2}
                    </h3>
                  </div>
                  
                  <button
                    onClick={() => handleCopy(title, index)}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="复制标题"
                  >
                    {copiedIndex === index ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(lastRequestPayload || lastResponsePayload) && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <FileText className="w-5 h-5 text-emerald-500" />
              <h2>调用日志</h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs font-semibold text-zinc-400 mb-2">发送消息</div>
                <pre className="text-xs text-zinc-300 overflow-auto max-h-[360px] whitespace-pre-wrap break-all">
{JSON.stringify(lastRequestPayload || {}, null, 2)}
                </pre>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs font-semibold text-zinc-400 mb-2">接收消息</div>
                <pre className="text-xs text-zinc-300 overflow-auto max-h-[360px] whitespace-pre-wrap break-all">
{JSON.stringify(lastResponsePayload || {}, null, 2)}
                </pre>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
