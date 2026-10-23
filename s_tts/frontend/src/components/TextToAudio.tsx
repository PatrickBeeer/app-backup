import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, Download, FileText, Loader2, UploadCloud, Volume2, Wand2, X } from 'lucide-react';
import * as mammoth from 'mammoth';

type VoiceItem = {
  voice_id: string;
  voice_name: string;
  voice_language: string;
  trial_url: string;
};

const KLING_BASE = ((import.meta as any)?.env?.VITE_KLING_API_BASE_URL as string | undefined)?.trim() || 'https://hk.n1n.ai';

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += ch;
  }

  cells.push(cell.trim());
  return cells;
}

function parsePresetVoicesCSV(csvText: string): VoiceItem[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = parseDelimitedLine(lines[0], delimiter);

  const nameIdx = headers.findIndex((h) => h.toLowerCase() === 'voice name');
  const idIdx = headers.findIndex((h) => h.toLowerCase() === 'voice id');
  const langIdx = headers.findIndex((h) => h.toLowerCase() === 'voice language');
  const demoIdx = headers.findIndex((h) => h.toLowerCase() === 'voice demo');

  if (nameIdx < 0 || idIdx < 0 || langIdx < 0 || demoIdx < 0) {
    return [];
  }

  const voices: VoiceItem[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseDelimitedLine(lines[i], delimiter);
    const voice_name = (cells[nameIdx] || '').trim();
    const voice_id = (cells[idIdx] || '').trim();
    const voice_language = (cells[langIdx] || '').trim();
    const trial_url = (cells[demoIdx] || '').trim();

    if (!voice_name || !voice_id || !voice_language || !trial_url) {
      continue;
    }

    voices.push({ voice_name, voice_id, voice_language, trial_url });
  }

  return voices;
}

function withBearerHeader(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
}

function findFirstAudioUrl(payload: any): string {
  const direct = [
    payload?.data?.task_result?.audios?.[0]?.url,
    ...(Array.isArray(payload?.data?.task_result?.audios)
      ? payload.data.task_result.audios.map((item: any) => item?.url)
      : []),
    payload?.data?.audio_url,
    payload?.data?.url,
    payload?.data?.audioUrl,
    payload?.audio_url,
    payload?.url,
    payload?.audioUrl,
  ];

  for (const value of direct) {
    const text = String(value || '').trim();
    if (/^https?:\/\//i.test(text)) return text;
  }

  const queue: any[] = [payload];
  const seen = new Set<any>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === 'string') {
      const text = current.trim();
      if (/^https?:\/\//i.test(text)) {
        return text;
      }
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (typeof current === 'object') {
      for (const value of Object.values(current)) queue.push(value);
    }
  }

  return '';
}

export default function TextToAudio() {
  const [apiKey, setApiKey] = useState('');

  const [text, setText] = useState('');
  const [textFile, setTextFile] = useState<File | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [isResultListening, setIsResultListening] = useState(false);

  const [generatingTts, setGeneratingTts] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastTtsRequest, setLastTtsRequest] = useState<any>(null);
  const [lastTtsResponse, setLastTtsResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const resultAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasApiKey = useMemo(() => Boolean(apiKey.trim()), [apiKey]);
  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voice_id === selectedVoiceId) || null,
    [voices, selectedVoiceId],
  );

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const loadKeyFromConfig = async () => {
    try {
      const configUrl = 'config/keys.json';
      const res = await fetch(configUrl, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`读取 keys.json 失败，HTTP ${res.status}`);
      }

      const data = await res.json();
      const key = String(data?.keys?.[0]?.k_kling_tts || '').trim();
      if (!key) {
        throw new Error('keys.json 中未找到 k_kling_tts');
      }

      setApiKey(key);
    } catch (err: any) {
      console.error('loadKeyFromConfig error:', err);
      setError(err?.message || '读取 API Key 失败');
    }
  };

  const loadVoicesFromConfig = async () => {
    try {
      const csvUrl = 'config/preset_voices.csv';
      const res = await fetch(csvUrl, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`读取 preset_voices.csv 失败，HTTP ${res.status}`);
      }
      const csvText = await res.text();
      const parsed = parsePresetVoicesCSV(csvText);
      if (parsed.length === 0) {
        throw new Error('preset_voices.csv 无可用音色');
      }
      setVoices(parsed);
      setSelectedVoiceId((current) => (current && parsed.some((v) => v.voice_id === current) ? current : parsed[0].voice_id));
    } catch (err: any) {
      console.error('loadVoicesFromConfig error:', err);
      setError(err?.message || '读取预设音色失败');
    }
  };

  useEffect(() => {
    loadKeyFromConfig();
    loadVoicesFromConfig();
  }, []);

  useEffect(() => {
    return () => {
      if (resultAudioRef.current) {
        resultAudioRef.current.pause();
        resultAudioRef.current = null;
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

  const toggleResultListening = async () => {
    if (!audioUrl) return;

    try {
      if (!resultAudioRef.current) {
        const audio = new Audio(audioUrl);
        audio.onended = () => setIsResultListening(false);
        audio.onerror = () => {
          setIsResultListening(false);
          setError('试听失败，请稍后重试。');
        };
        resultAudioRef.current = audio;
      }

      if (isResultListening) {
        resultAudioRef.current.pause();
        setIsResultListening(false);
      } else {
        resultAudioRef.current.src = audioUrl;
        await resultAudioRef.current.play();
        setIsResultListening(true);
      }
    } catch {
      setIsResultListening(false);
      setError('试听失败，请稍后重试。');
    }
  };

  const generateTts = async () => {
    if (!hasApiKey) {
      setError('系统密钥未就绪，请检查 config/keys.json');
      return;
    }
    if (!text.trim()) {
      setError('请输入文案内容');
      return;
    }
    if (!selectedVoiceId.trim()) {
      setError('请先选择可用音色');
      return;
    }
    if (!selectedVoice) {
      setError('未找到已选音色，请重新选择');
      return;
    }

    setGeneratingTts(true);
    setError(null);
    setAudioUrl(null);
    setIsResultListening(false);
    if (resultAudioRef.current) {
      resultAudioRef.current.pause();
    }
    setLastTtsRequest(null);
    setLastTtsResponse(null);

    try {
      const payload = {
        text: text.trim(),
        voice_id: selectedVoice.voice_id,
        voice_language: selectedVoice.voice_language,
        voice_speed: Number(voiceSpeed.toFixed(1)),
      };
      setLastTtsRequest(payload);

      const res = await fetch(`${KLING_BASE}/kling/v1/audio/tts`, {
        method: 'POST',
        headers: withBearerHeader(apiKey),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || `TTS 调用失败，HTTP ${res.status}`);
      }

      setLastTtsResponse(data);
      const candidateUrl = findFirstAudioUrl(data);
      if (candidateUrl) {
        setAudioUrl(candidateUrl);
      } else {
        setError('接口已返回成功，但未找到可下载音频地址，请查看下方接口返回。');
      }
    } catch (err: any) {
      console.error('generateTts error:', err);
      setError(err?.message || 'TTS 调用失败');
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
          文案转音频
        </motion.h1>
        <p className="text-zinc-400 max-w-3xl mx-auto text-sm md:text-base leading-relaxed">
          当前仅支持预设音色进行 TTS。自定义音色能力将迁移到 V2 页面。
        </p>
        <div className="mx-auto max-w-3xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
          V2 版本制作中，敬请期待
        </div>
      </header>

      <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-yellow-400" /> TTS 生成
        </h2>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300">语音</label>
          <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950">
            <button
              type="button"
              onClick={() => setIsVoiceMenuOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-3 text-left"
            >
              <span className="text-sm text-zinc-100">{selectedVoice?.voice_name || '请选择语音'}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isVoiceMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isVoiceMenuOpen && (
              <div className="max-h-72 overflow-auto border-t border-zinc-800">
                {voices.map((voice) => (
                  <div key={voice.voice_id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVoiceId(voice.voice_id);
                        setIsVoiceMenuOpen(false);
                      }}
                      className="flex-1 text-left px-2 py-1.5 rounded-md text-sm text-zinc-100 flex items-center gap-2"
                    >
                      <span className="inline-flex w-4">
                        {selectedVoiceId === voice.voice_id ? <Check className="w-4 h-4 text-emerald-400" /> : null}
                      </span>
                      <span>{voice.voice_name}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300">语速：{voiceSpeed.toFixed(1)}</label>
          <input
            type="range"
            min="0.8"
            max="2"
            step="0.1"
            value={voiceSpeed}
            onChange={(e) => setVoiceSpeed(Number(e.target.value))}
            className="w-full"
          />
        </div>

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
          disabled={generatingTts}
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

        {audioUrl && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void toggleResultListening()}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm inline-flex items-center gap-2"
              >
                {isResultListening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                {isResultListening ? '停止试听' : '试听音频'}
              </button>

              <a
                href={audioUrl}
                download
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> 下载音频
              </a>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="text-red-400 text-sm bg-red-950/30 p-3 rounded-lg border border-red-900/50">{error}</div>
      )}

      {lastTtsRequest && (
        <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">本次发送参数</h2>
          <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">
            {JSON.stringify(lastTtsRequest, null, 2)}
          </pre>
        </section>
      )}

      {lastTtsResponse && (
        <section className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">接口返回</h2>
          <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-zinc-300">
            {JSON.stringify(lastTtsResponse, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
