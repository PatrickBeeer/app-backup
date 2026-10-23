import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AudioLines, Loader2, RefreshCw, Sparkles, Volume2 } from 'lucide-react';
import { fetchWithAuthFallback } from '../lib/authHeaders';

const DEFAULT_MODEL = 'cosyvoice-v3.5-flash';
const ALIYUNCS_COSYVOICE_CLONE_ENDPOINT = '/api_manager/api/v1/execute/aliyuncs-cosyvoice-clone';
const ALIYUNCS_COSYVOICE_STATUS_ENDPOINT = '/api_manager/api/v1/execute/aliyuncs-cosyvoice-status';
const ALIYUNCS_COSYVOICE_TTS_ENDPOINT = '/api_manager/api/v1/execute/aliyuncs-cosyvoice-tts';
const DEFAULT_UPLOAD_BASE_URL = String((import.meta as any)?.env?.VITE_STTS_UPLOAD_BASE_URL || '').replace(/\/+$/, '');
const MAX_VOICE_FILE_BYTES = 30 * 1024 * 1024;
const SUPPORTED_VOICE_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']);

function createAudioUrlFromBase64(base64: string) {
  const clean = (base64 || '').trim();
  if (!clean) return '';
  return `data:audio/mpeg;base64,${clean}`;
}

function normalizeAliyuncsAssetUrl(rawUrl: string) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.trim().toLowerCase();
    if (parsed.protocol === 'http:' && (hostname === 'aliyuncs.com' || hostname.endsWith('.aliyuncs.com'))) {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

type AnyObject = Record<string, any>;

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function asObject(value: unknown): AnyObject {
  return value && typeof value === 'object' ? (value as AnyObject) : {};
}

function unwrapEnvelope(payload: unknown): AnyObject {
  let current = asObject(payload);
  for (let i = 0; i < 5; i += 1) {
    if (current.code === 0 && Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = asObject(current.data);
      continue;
    }
    if (current.success === true && Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = asObject(current.data);
      continue;
    }
    break;
  }
  return current;
}

function joinUrl(baseUrl: string, path: string) {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return path;
  return `${base}${path}`;
}

function inferUploadBaseUrl(configuredBase: string) {
  return (configuredBase || '').trim().replace(/\/+$/, '');
}

function buildUploadedVoiceUrl(fileName: string, uploadBaseUrl: string) {
  const encodedName = encodeURIComponent(fileName);
  const uploadPath = `/standalone/s_tts/custom_voice_files/${encodedName}`;
  const explicitBase = inferUploadBaseUrl(uploadBaseUrl);
  const publicBase = explicitBase || window.location.origin;
  return {
    uploadUrl: explicitBase ? joinUrl(explicitBase, uploadPath) : uploadPath,
    publicUrl: joinUrl(publicBase, uploadPath),
  };
}

async function uploadVoiceFile(file: File) {
  const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { uploadUrl, publicUrl } = buildUploadedVoiceUrl(safeFileName, DEFAULT_UPLOAD_BASE_URL);

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`样本音频上传失败，HTTP ${response.status}`);
  }

  return publicUrl;
}

function validateAudioFile(file: File | null) {
  if (!file) {
    return '请选择样本音频文件';
  }

  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!SUPPORTED_VOICE_EXTENSIONS.has(extension)) {
    return '仅支持 mp3、wav、m4a、aac、flac、ogg 音频文件';
  }

  if (file.size > MAX_VOICE_FILE_BYTES) {
    return '样本音频超过 30MB 限制';
  }

  return '';
}

export default function TextToAudioV3() {
  const [prefix, setPrefix] = useState('myvoice');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');

  const [text, setText] = useState('');
  const [resultAudioUrl, setResultAudioUrl] = useState('');

  const [loadingEnroll, setLoadingEnroll] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingSynthesize, setLoadingSynthesize] = useState(false);

  const [error, setError] = useState('');
  const [debugResponse, setDebugResponse] = useState<any>(null);

  const canEnroll = useMemo(() => Boolean(prefix.trim() && audioFile), [prefix, audioFile]);
  const canCheckStatus = useMemo(() => Boolean(voiceId.trim()), [voiceId]);
  const canSynthesize = useMemo(() => Boolean(voiceId.trim() && text.trim()), [voiceId, text]);

  const enrollVoice = async () => {
    if (!canEnroll) return;

    setLoadingEnroll(true);
    setError('');
    setDebugResponse(null);

    try {
      const fileError = validateAudioFile(audioFile);
      if (fileError) {
        throw new Error(fileError);
      }

      const audioUrl = await uploadVoiceFile(audioFile as File);
      setUploadedAudioUrl(audioUrl);

      const requestPayload = {
        prefix: prefix.trim(),
        url: audioUrl,
        model: DEFAULT_MODEL,
      };

      const res = await fetchWithAuthFallback(ALIYUNCS_COSYVOICE_CLONE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const payload = await res.json().catch(() => ({}));
      const data = unwrapEnvelope(payload);
      if (!res.ok || payload?.code !== 0) {
        throw new Error(payload?.message || `创建音色失败，HTTP ${res.status}`);
      }

      const newVoiceId = String(data.voice_id || '').trim();
      if (newVoiceId) {
        setVoiceId(newVoiceId);
      }
      setDebugResponse({ request: requestPayload, response: payload });
    } catch (err: any) {
      setError(err?.message || '创建音色失败');
    } finally {
      setLoadingEnroll(false);
    }
  };

  const checkStatus = async () => {
    if (!canCheckStatus) return;

    setLoadingStatus(true);
    setError('');

    try {
      const requestPayload = {
        voice_id: voiceId.trim(),
        model: DEFAULT_MODEL,
      };

      const res = await fetchWithAuthFallback(ALIYUNCS_COSYVOICE_STATUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const payload = await res.json().catch(() => ({}));
      const data = unwrapEnvelope(payload);
      if (!res.ok || payload?.code !== 0) {
        throw new Error(payload?.message || `查询音色状态失败，HTTP ${res.status}`);
      }

      setVoiceStatus(String(data.status || '').toUpperCase());
      setDebugResponse({ request: requestPayload, response: payload });
    } catch (err: any) {
      setError(err?.message || '查询音色状态失败');
    } finally {
      setLoadingStatus(false);
    }
  };

  const synthesize = async () => {
    if (!canSynthesize) return;

    setLoadingSynthesize(true);
    setError('');
    setResultAudioUrl('');

    try {
      const requestPayload = {
        text: text.trim(),
        voice: voiceId.trim(),
        model: DEFAULT_MODEL,
      };

      const res = await fetchWithAuthFallback(ALIYUNCS_COSYVOICE_TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const payload = await res.json().catch(() => ({}));
      const data = unwrapEnvelope(payload);
      if (!res.ok || payload?.code !== 0) {
        throw new Error(payload?.message || `合成失败，HTTP ${res.status}`);
      }

      const directUrl = normalizeAliyuncsAssetUrl(String(data.audio_url || '').trim());
      const b64 = String(data.audio_base64 || '').trim();
      const playable = directUrl || createAudioUrlFromBase64(b64);
      if (!playable) {
        throw new Error('接口返回成功，但没有拿到音频地址');
      }

      setResultAudioUrl(playable);
      setDebugResponse({ request: requestPayload, response: payload });
    } catch (err: any) {
      setError(err?.message || '语音合成失败');
    } finally {
      setLoadingSynthesize(false);
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
          文案转音频 CosyVoice
        </motion.h1>
      </header>

      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" /> Step 1: 创建音色
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">音色前缀</label>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100"
              placeholder="myvoice"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-300">样本音频文件</label>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"
              onChange={(e) => {
                setAudioFile(e.target.files?.[0] || null);
                setUploadedAudioUrl('');
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 file:mr-3 file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-100"
            />
            <p className="text-xs text-zinc-500">当前文件：{audioFile?.name || '未选择文件'}</p>
            {uploadedAudioUrl && (
              <p className="text-xs text-emerald-300 break-all">已上传地址：{uploadedAudioUrl}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={enrollVoice}
          disabled={!canEnroll || loadingEnroll}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          {loadingEnroll ? <Loader2 className="w-4 h-4 animate-spin" /> : <AudioLines className="w-4 h-4" />}
          {loadingEnroll ? '创建中...' : '创建音色'}
        </button>
      </section>

      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-cyan-400" /> Step 2: 查询音色状态
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 space-y-2">
            <label className="text-sm text-zinc-300">Voice ID</label>
            <input
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100"
              placeholder="voice_xxx"
            />
          </div>

          <button
            type="button"
            onClick={checkStatus}
            disabled={!canCheckStatus || loadingStatus}
            className="h-11 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-cyan-600 text-white disabled:opacity-50"
          >
            {loadingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loadingStatus ? '查询中...' : '查询状态'}
          </button>
        </div>

        {voiceStatus && (
          <div className="text-sm px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200">
            当前状态：<span className="text-emerald-300 font-semibold">{voiceStatus}</span>
          </div>
        )}
      </section>

      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-blue-400" /> Step 3: 文案合成
        </h2>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300">文案内容</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 resize-y"
            placeholder="请输入需要生成语音的文案"
          />
        </div>

        <button
          type="button"
          onClick={synthesize}
          disabled={!canSynthesize || loadingSynthesize}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          {loadingSynthesize ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
          {loadingSynthesize ? '合成中...' : '生成语音'}
        </button>

        {resultAudioUrl && (
          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <audio controls className="w-full" src={resultAudioUrl} />
            <a
              href={resultAudioUrl}
              download="cosyvoice-v3-output.mp3"
              className="inline-flex items-center text-sm text-emerald-300 hover:text-emerald-200"
            >
              下载音频
            </a>
          </div>
        )}
      </section>

      {error && (
        <section className="rounded-xl border border-red-500/40 bg-red-900/20 p-4 text-red-200 text-sm">
          {error}
        </section>
      )}

      <details className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <summary className="cursor-pointer text-zinc-300">调试响应（展开查看）</summary>
        <pre className="mt-3 text-xs text-zinc-400 overflow-auto whitespace-pre-wrap break-words">
          {pretty(debugResponse)}
        </pre>
      </details>
    </div>
  );
}
