import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Download, FileText, Loader2, UploadCloud, Wand2, X } from 'lucide-react';
import * as mammoth from 'mammoth';
import { getAuthHeaders } from '../lib/authHeaders';

// API Manager gateway public Vidu routes.
const VIDU_TTS_PROXY = '/api_manager/api/v1/execute/vidu-tts';
const VIDU_CLONE_PROXY = '/api_manager/api/v1/execute/vidu-clone';

const DEFAULT_VOICE_PREFIX = 'vidu_voice_';
const SAMPLE_AUDIO_URL = 'https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/cosyvoice/cosyvoice-zeroshot-sample.wav';
const MAX_VOICE_FILE_BYTES = 30 * 1024 * 1024;
const SUPPORTED_VOICE_EXTENSIONS = new Set(['mp3', 'wav', 'mp4', 'mov']);
const DEFAULT_UPLOAD_BASE_URL = String((import.meta as any)?.env?.VITE_STTS_UPLOAD_BASE_URL || '').replace(/\/+$/, '');

function randomTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

type AnyObject = Record<string, any>;

function unwrapSuccessEnvelope(payload: any): AnyObject {
  let current = payload;
  for (let i = 0; i < 5; i += 1) {
    if (
      current &&
      typeof current === 'object' &&
      current.success === true &&
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
      continue;
    }
    break;
  }
  return current && typeof current === 'object' ? current : {};
}

function safePreview(value: unknown, maxLength = 400): string {
  try {
    const raw = JSON.stringify(value);
    if (!raw) return '';
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
  } catch {
    return '';
  }
}

function asObject(value: unknown): AnyObject {
  return value && typeof value === 'object' ? (value as AnyObject) : {};
}

function joinUrl(baseUrl: string, path: string) {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return path;
  return `${base}${path}`;
}

export default function TextToAudioV2() {
  const [uploadBaseUrl, setUploadBaseUrl] = useState(DEFAULT_UPLOAD_BASE_URL);

  // Voice clone inputs
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [isDraggingVoice, setIsDraggingVoice] = useState(false);
  const voiceFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedVoiceUrl, setUploadedVoiceUrl] = useState('');
  const [voiceSampleUrl, setVoiceSampleUrl] = useState('');
  const [voiceUploadWarning, setVoiceUploadWarning] = useState<string | null>(null);
  const [voicePrefix, setVoicePrefix] = useState(DEFAULT_VOICE_PREFIX);
  const [voiceId, setVoiceId] = useState('');
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [cloningVoice, setCloningVoice] = useState(false);

  // TTS inputs
  const [text, setText] = useState('');
  const [textFile, setTextFile] = useState<File | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const [ttsUsingClone, setTtsUsingClone] = useState(true);
  const [presetVoiceId, setPresetVoiceId] = useState('');

  const [generatingTts, setGeneratingTts] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lastCloneRequest, setLastCloneRequest] = useState<any>(null);
  const [lastCloneResponse, setLastCloneResponse] = useState<any>(null);
  const [lastTtsRequest, setLastTtsRequest] = useState<any>(null);
  const [lastTtsResponse, setLastTtsResponse] = useState<any>(null);

  const latestObjectUrlRef = useRef<string | null>(null);

  const canUseVoiceId = !ttsUsingClone || Boolean(voiceId.trim());
  const ttsDisabledReason = ttsUsingClone && !canUseVoiceId
    ? '请先复刻音色（声音复刻模式需要 Voice ID）'
    : !ttsUsingClone && !presetVoiceId.trim()
      ? '请输入预设音色 ID'
      : !text.trim()
        ? '请输入文案内容'
        : '';

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  useEffect(() => {
    return () => {
      if (latestObjectUrlRef.current) {
        URL.revokeObjectURL(latestObjectUrlRef.current);
      }
    };
  }, []);

  const processTextFile = async (selected: File) => {
    setTextFile(selected);
    setError(null);

    if (selected.name.endsWith('.docx')) {
      try {
        const arrayBuffer = await selected.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setText(result.value);
      } catch (err) {
        console.error('docx parse error:', err);
        setError('Word 文档解析失败');
        setTextFile(null);
      }
      return;
    }

    if (selected.type.startsWith('text/') || selected.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setText(event.target?.result as string);
      };
      reader.readAsText(selected);
      return;
    }

    setError('仅支持 txt/md/docx 文案文件');
    setTextFile(null);
  };

  const uploadVoiceFile = async (fileToUpload: File) => {
    setUploadingVoice(true);
    setError(null);
    setVoiceUploadWarning(null);

    try {
      const fileName = `${Date.now()}_${fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const encodedName = encodeURIComponent(fileName);
      const uploadPath = `/standalone/s_tts/custom_voice_files/${encodedName}`;
      
      const uploadBase = inferUploadBaseUrl(uploadBaseUrl);
      const uploadUrl = uploadBase ? joinUrl(uploadBase, uploadPath) : uploadPath;

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileToUpload.type || 'application/octet-stream',
        },
        body: fileToUpload,
      });

      if (!res.ok) {
        throw new Error(`上传失败，HTTP ${res.status}`);
      }

      // Return the full URL for Vidu API
      const baseUrl = uploadBase || window.location.origin;
      setUploadedVoiceUrl(`${baseUrl}/${uploadPath}`);
    } catch (err: any) {
      console.error('uploadVoiceFile error:', err);
      setVoiceUploadWarning(`自动上传失败：${err.message}。将回退到"样本 URL"流程。`);
      setUploadedVoiceUrl('');
      setError(null);
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleVoiceFilePicked = async (selected: File) => {
    const extension = (selected.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_VOICE_EXTENSIONS.has(extension)) {
      setVoiceUploadWarning('仅支持 .mp3 / .wav 音频文件和 .mp4 / .mov 视频文件。');
      setVoiceFile(null);
      setUploadedVoiceUrl('');
      return;
    }

    if (selected.size > MAX_VOICE_FILE_BYTES) {
      const warning = `文件过大：${formatFileSize(selected.size)}，上限为 ${formatFileSize(MAX_VOICE_FILE_BYTES)}。`;
      setVoiceUploadWarning(warning);
      setVoiceFile(null);
      setUploadedVoiceUrl('');
      return;
    }

    setVoiceFile(selected);
    await uploadVoiceFile(selected);
  };

  function inferUploadBaseUrl(configuredBase: string) {
    const explicit = (configuredBase || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    return '';
  }

  // Vidu Clone via API Manager proxy
  const cloneVoice = async () => {
    setCloningVoice(true);
    setError(null);
    setLastCloneResponse(null);

    try {
      const sourceUrl = uploadedVoiceUrl.trim() || voiceSampleUrl.trim() || SAMPLE_AUDIO_URL;
      const safePrefix = (voicePrefix.trim().replace(/[^a-z0-9_-]/g, '') || DEFAULT_VOICE_PREFIX).toLowerCase();
      const voiceIdCandidate = safePrefix.slice(0, 20) + '_' + randomTaskId().slice(0, 8);

      const requestPayload = {
        audio_url: sourceUrl,
        voice_id: voiceIdCandidate,
        text: '这是测试文本，用于验证音色复刻效果。',
      };

      setLastCloneRequest(requestPayload);

      const res = await fetch(VIDU_CLONE_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const rawData = await res.text();
      let envelope: AnyObject = {};
      try {
        envelope = rawData ? JSON.parse(rawData) : {};
      } catch {
        throw new Error(`API Manager 返回不可解析响应 (HTTP ${res.status}): ${rawData.slice(0, 200)}`);
      }

      if (!res.ok || envelope?.code !== 0) {
        const errMsg = envelope?.message || `HTTP ${res.status}`;
        throw new Error(`音色复刻失败：${errMsg}`);
      }

      const data = unwrapSuccessEnvelope(envelope);
      setLastCloneResponse(data);

      const returnedVoiceId = data?.voice_id || voiceIdCandidate;
      setVoiceId(returnedVoiceId);

      if (data?.state === 'success' && data?.demo_audio) {
        setAudioUrl(data.demo_audio);
      }
    } catch (err: any) {
      console.error('cloneVoice error:', err);
      setError(err?.message || '音色复刻失败');
    } finally {
      setCloningVoice(false);
    }
  };

  // Vidu TTS via API Manager proxy
  const generateTts = async () => {
    const finalVoiceId = ttsUsingClone 
      ? voiceId.trim() 
      : presetVoiceId.trim();

    if (!finalVoiceId) {
      setError(ttsUsingClone ? '请先创建并确认音色' : '请选择预设音色');
      return;
    }

    if (!text.trim()) {
      setError('请输入文案内容');
      return;
    }

    setGeneratingTts(true);
    setError(null);
    setLastTtsRequest(null);
    setLastTtsResponse(null);

    try {
      if (latestObjectUrlRef.current) {
        URL.revokeObjectURL(latestObjectUrlRef.current);
        latestObjectUrlRef.current = null;
      }

      const requestPayload = {
        text: text.trim(),
        voice_setting_voice_id: finalVoiceId,
        voice_setting_speed: 1.0,
        voice_setting_volume: 0,
      };

      setLastTtsRequest(requestPayload);

      const res = await fetch(VIDU_TTS_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const rawData = await res.text();
      let envelope: AnyObject = {};
      try {
        envelope = rawData ? JSON.parse(rawData) : {};
      } catch {
        throw new Error(`API Manager 返回不可解析响应 (HTTP ${res.status}): ${rawData.slice(0, 200)}`);
      }

      if (!res.ok || envelope?.code !== 0) {
        const errMsg = envelope?.message || `HTTP ${res.status}`;
        throw new Error(`TTS 生成失败：${errMsg}`);
      }

      const data = unwrapSuccessEnvelope(envelope);
      setLastTtsResponse(data);

      const fileUrl = data?.file_url || data?.url;
      if (fileUrl) {
        latestObjectUrlRef.current = fileUrl;
        setAudioUrl(fileUrl);
      } else {
        throw new Error('接口已返回成功，但未找到音频地址');
      }
    } catch (err: any) {
      console.error('generateTts error:', err);
      setError(err?.message || 'TTS 调用失败');
      setLastTtsResponse({ success: false, message: err?.message || 'unknown error' });
    } finally {
      setGeneratingTts(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <header className="text-center space-y-4">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-white"
        >
          文案转音频 V2（Vidu TTS & 声音复刻）
        </motion.h1>
        <p className="text-zinc-400 max-w-3xl mx-auto text-sm md:text-base leading-relaxed">
          使用 k_n1n_vidu_default（key_id=9）调用 Vidu API，支持声音复刻和预设音色 TTS。无需轮询，直接生成。
        </p>
      </header>

      {/* Mode Toggle */}
      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8">
        <h2 className="text-lg font-semibold text-white mb-4">模式选择</h2>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setTtsUsingClone(false)}
            className={`px-4 py-2 rounded-lg text-sm ${
              !ttsUsingClone
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            预设音色 TTS
          </button>
          <button
            type="button"
            onClick={() => setTtsUsingClone(true)}
            className={`px-4 py-2 rounded-lg text-sm ${
              ttsUsingClone
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            声音复刻 TTS
          </button>
        </div>
      </section>

      {/* Step 1: Voice Setup */}
      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          {!ttsUsingClone ? <Wand2 className="w-5 h-5 text-yellow-400" /> : <UploadCloud className="w-5 h-5 text-blue-500" />}
          {!ttsUsingClone ? 'Step 1: 选择预设音色' : 'Step 1: 声音复刻'}
        </h2>

        {!ttsUsingClone ? (
          // Preset voice selection
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">预设音色 ID</label>
            <input
              value={presetVoiceId}
              onChange={(e) => setPresetVoiceId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100"
              placeholder="例如：default_female_1"
            />
            <p className="text-xs text-zinc-500">可在 Vidu 音色列表中查找可用音色 ID。</p>
          </div>
        ) : (
          // Voice clone setup
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">音色前缀（用于生成唯一 voice_id）</label>
              <input
                value={voicePrefix}
                onChange={(e) => setVoicePrefix(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100"
                placeholder="myvoice"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-zinc-300 flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-500" />
                上传音色样本（可选，不上传则使用官方样例）
              </label>
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 transition-all text-center ${
                  isDraggingVoice
                    ? 'border-blue-500 bg-blue-500/10'
                    : voiceFile
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-zinc-800 bg-zinc-950/50'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingVoice(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingVoice(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingVoice(false);
                  const selected = e.dataTransfer.files?.[0];
                  if (selected) {
                    void handleVoiceFilePicked(selected);
                  }
                }}
              >
                <input
                  type="file"
                  ref={voiceFileInputRef}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) {
                      void handleVoiceFilePicked(selected);
                    }
                  }}
                  className="hidden"
                  accept=".mp3,.wav,.mp4,.mov,audio/mpeg,audio/wav,video/mp4,video/quicktime"
                />

                {!voiceFile ? (
                  <div className="flex flex-col items-center gap-3 cursor-pointer" onClick={() => voiceFileInputRef.current?.click()}>
                    <UploadCloud className="w-5 h-5 text-zinc-400" />
                    <p className="text-sm text-zinc-300">点击或拖拽上传 mp3/wav/mp4/mov</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="text-left overflow-hidden">
                        <p className="text-sm font-medium text-zinc-200 truncate">{voiceFile.name}</p>
                        <p className="text-xs text-zinc-500">{formatFileSize(voiceFile.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setVoiceFile(null);
                        setUploadedVoiceUrl('');
                        setVoiceUploadWarning(null);
                        if (voiceFileInputRef.current) voiceFileInputRef.current.value = '';
                      }}
                      className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-300">样本 URL（公网可访问）</label>
                <input
                  value={voiceSampleUrl}
                  onChange={(e) => setVoiceSampleUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100"
                  placeholder="https://.../your_voice_sample.wav"
                />
                <p className="text-xs text-zinc-500">上传结果 URL（优先作为样本）：{uploadedVoiceUrl || '未上传或当前环境不支持上传'}</p>
              </div>

              {voiceUploadWarning && (
                <div className="text-amber-300 text-sm bg-amber-950/40 p-3 rounded-lg border border-amber-800/50">
                  {voiceUploadWarning}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={cloneVoice}
                disabled={cloningVoice || uploadingVoice}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50"
              >
                {cloningVoice ? '复刻中...' : '开始复刻音色'}
              </button>
            </div>

            {(uploadingVoice || cloningVoice) && (
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadingVoice ? '正在上传样本...' : '正在复刻音色...'}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300">
                Voice ID: <span className="text-zinc-100 break-all">{voiceId || '-'}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: TTS Generation */}
      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-yellow-400" /> Step 2: 语音合成
        </h2>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-300 flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-blue-500" /> 导入文案文件（可选）
          </label>
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 transition-all text-center ${
              isDraggingText
                ? 'border-blue-500 bg-blue-500/10'
                : textFile
                  ? 'border-blue-500/50 bg-blue-500/5'
                  : 'border-zinc-800 bg-zinc-950/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingText(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingText(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingText(false);
              const selected = e.dataTransfer.files?.[0];
              if (selected) processTextFile(selected);
            }}
          >
            <input
              type="file"
              ref={textFileInputRef}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) processTextFile(selected);
              }}
              className="hidden"
              accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />

            {!textFile ? (
              <div className="flex flex-col items-center gap-3 cursor-pointer" onClick={() => textFileInputRef.current?.click()}>
                <UploadCloud className="w-5 h-5 text-zinc-400" />
                <p className="text-sm text-zinc-300">点击或拖拽上传文案文件（txt/md/docx）</p>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="text-left overflow-hidden">
                    <p className="text-sm font-medium text-zinc-200 truncate">{textFile.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(textFile.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTextFile(null);
                    setText('');
                    if (textFileInputRef.current) textFileInputRef.current.value = '';
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="请输入要合成的文案"
          className="w-full h-44 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder:text-zinc-600 resize-none"
        />

        <button
          onClick={generateTts}
          disabled={generatingTts || Boolean(ttsDisabledReason)}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center gap-2"
        >
          {generatingTts ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            '调用 TTS'
          )}
        </button>

        {ttsDisabledReason && (
          <p className="text-xs text-zinc-400">{ttsDisabledReason}</p>
        )}

        {audioUrl && (
          <div className="space-y-3">
            <audio controls src={audioUrl} className="w-full" />
            <a href={audioUrl} download="vidu_output.mp3" className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white">
              <Download className="w-4 h-4" /> 下载音频
            </a>
          </div>
        )}
      </section>

      {error && (
        <div className="text-red-400 text-sm bg-red-950/30 p-3 rounded-lg border border-red-900/50">{error}</div>
      )}

      {(lastCloneRequest || lastCloneResponse || lastTtsRequest || lastTtsResponse) && (
        <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">调用日志</h2>
          {lastCloneRequest && (
            <div>
              <p className="text-sm text-zinc-300 mb-2">音色复刻请求</p>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">{JSON.stringify(lastCloneRequest, null, 2)}</pre>
            </div>
          )}
          {lastCloneResponse && (
            <div>
              <p className="text-sm text-zinc-300 mb-2">音色复刻回包</p>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">{JSON.stringify(lastCloneResponse, null, 2)}</pre>
            </div>
          )}
          {lastTtsRequest && (
            <div>
              <p className="text-sm text-zinc-300 mb-2">TTS 请求</p>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">{JSON.stringify(lastTtsRequest, null, 2)}</pre>
            </div>
          )}
          {lastTtsResponse && (
            <div>
              <p className="text-sm text-zinc-300 mb-2">TTS 回包</p>
              <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">{JSON.stringify(lastTtsResponse, null, 2)}</pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
