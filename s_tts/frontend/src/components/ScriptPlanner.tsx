import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Copy, CheckCircle2, UploadCloud, FileText, X, Lightbulb, ListTree, Video, Loader2 } from 'lucide-react';
import * as mammoth from 'mammoth';
import ReactMarkdown from 'react-markdown';
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
      const textPart = parts.find((part: any) => typeof part?.text === 'string');
      if (textPart?.text) return textPart.text;
    }
  }

  if (typeof payload?.text === 'string') return payload.text;
  return '';
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

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('model did not return valid JSON');
}

interface ScriptSection {
  title: string;
  content: string;
  editingSuggestion: string;
  coreAnnotation: string;
}

interface ScriptAnalysis {
  sections: ScriptSection[];
  viralPoints: string[];
}

export default function ScriptPlanner() {
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ScriptAnalysis | null>(null);
  const [lastRequestPayload, setLastRequestPayload] = useState<any>(null);
  const [lastResponsePayload, setLastResponsePayload] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        // Ignore key preload errors.
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

  const clearFile = () => {
    setFile(null);
    setFileData(null);
    setTextContent(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    const hasContent = fileData || textContent;
    if (!hasContent) {
      setError('请上传素材');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    const key = apiKey.trim();
    if (!key) {
      setError('请先配置文本生成密钥。');
      setIsGenerating(false);
      return;
    }

    setLastRequestPayload(null);
    setLastResponsePayload(null);

    try {
      const prompt = `你是一个资深的短视频编导和剪辑师。请帮我分析以下视频文案/素材，完成两项工作：
1. 脚本规划逻辑：梳理出清晰的视频结构分段（如：黄金前3秒、痛点引入、核心内容、反转/高潮、结尾引导等）。对于每个分段，请提供：
   - title: 分段标题
   - content: 该段落的核心文案或内容概述
   - editingSuggestion: 剪辑建议（如画面匹配、特效、音效、BGM节奏等）
   - coreAnnotation: 脚本核心注解（一句话说明该段落的目的和核心情绪，方便剪辑快速了解）
2. 提取爆点：提取出文案中最具吸引力、最容易引发共鸣或争议的3-5个"爆点"（Viral Points），并简要说明为什么这些点能火。

请以JSON格式返回，包含两个字段：
- sections: 对象数组，包含上述的脚本规划分段信息
- viralPoints: 字符串数组，包含提取的爆点说明`;

      const parts: any[] = [{ text: prompt }];

      if (textContent) {
        parts.push({ text: `\n\n上传的文档内容：\n${textContent}` });
      }

      if (fileData) {
        parts.push({
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType
          }
        });
      }

      const requestBody = {
        model: 'gemini-3-flash-preview',
        api_key: key,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              sections: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    content: { type: 'STRING' },
                    editingSuggestion: { type: 'STRING' },
                    coreAnnotation: { type: 'STRING' }
                  },
                  required: ['title', 'content', 'editingSuggestion', 'coreAnnotation']
                }
              },
              viralPoints: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['sections', 'viralPoints']
          }
        },
        task: 'text_gen',
        tier: 'normal',
        standalone_suite: 's_tts',
        standalone_tool: 'script-planner',
      };

      setLastRequestPayload(maskInlineData(requestBody));

      const response = await fetchWithAuthFallback(getLLMExecuteEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Standalone-Suite': 's_tts',
          'X-Standalone-Tool': 'script-planner',
        },
        credentials: 'same-origin',
        body: JSON.stringify(requestBody),
      });

      const raw = await response.text();
      let envelope: any = {};
      try {
        envelope = raw ? JSON.parse(raw) : {};
      } catch {
        envelope = {};
      }

      const payload = envelope?.data ?? envelope;
      const failed = !response.ok || envelope?.success === false || payload?.error;

      setLastResponsePayload(maskInlineData({
        attempts: [
          {
            mode: 'non_stream_only',
            ok: !failed,
            httpStatus: response.status,
            eventCount: 0,
            lastEvent: 'message',
            message: failed
              ? String(payload?.error?.message || envelope?.message || `生成失败 (HTTP ${response.status})`)
              : 'success',
            lastMessage: envelope,
          },
        ],
        selectedResult: failed ? 'failed' : 'success',
      }));

      if (failed) {
        const statusCode = response.status;
        const rawMessage = String(payload?.error?.message || envelope?.message || `生成失败 (HTTP ${statusCode})`);
        if (statusCode === 401 || rawMessage.includes('认证令牌')) {
          throw new Error('登录状态已失效，请先登录主站后重试。');
        }
        throw new Error(rawMessage);
      }

      const modelText = extractTextFromGeminiPayload(payload);
      const data = parseLooseJSONFromText(modelText);

      if (Array.isArray(data?.sections) && Array.isArray(data?.viralPoints)) {
        setResult(data);
      } else {
        throw new Error('生成的格式不正确');
      }
    } catch (err) {
      console.error("Error generating script analysis:", err);
      setError('生成失败，请稍后重试或检查登录状态。');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <ListTree className="w-6 h-6 text-emerald-500" />
          剪辑规划与爆点提取
        </h2>
        <p className="text-zinc-400">
          AI 帮你梳理视频结构逻辑，提取核心爆点，让剪辑更有方向。
        </p>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 space-y-6">
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
              <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                    {file.type.startsWith('video/') ? (
                      <Video className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <FileText className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div className="text-left overflow-hidden">
                    <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button 
                  onClick={clearFile}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
            <X className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !file}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>AI 正在分析规划中...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              <span>生成剪辑规划与爆点</span>
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Logic Section */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <ListTree className="w-5 h-5 text-emerald-500" />
                  脚本规划与剪辑建议
                </h3>
              </div>
              
              <div className="space-y-4">
                {result.sections.map((section, index) => (
                  <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                        {index + 1}
                      </div>
                      <h4 className="text-lg font-bold text-zinc-100">{section.title}</h4>
                    </div>
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">内容概述</div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{section.content}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">剪辑建议 (画面/音效)</div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{section.editingSuggestion}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">核心注解 (目的/情绪)</div>
                        <p className="text-sm text-emerald-400/90 leading-relaxed bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">{section.coreAnnotation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Viral Points Section */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                核心爆点提取
              </h3>
              <div className="grid gap-3">
                {result.viralPoints.map((point, index) => (
                  <div 
                    key={index}
                    className="group relative bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      <p className="text-zinc-300 text-sm leading-relaxed flex-1">{point}</p>
                      <button
                        onClick={() => copyToClipboard(point, index)}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        {copiedIndex === index ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
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
              <h3>调用日志</h3>
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
