import { useEffect, useRef, useState } from 'react';
import { videoPointCost, videoPricingConfigured } from './shared/omnihumanPricing';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';
import './video-preview.css';

type Image = { id: string; url: string };
type Audio = { audioId: string; audioUrl: string; seconds: number; durationSeconds: number; cropped: boolean; warning: string | null };
const prefix = '/standalone/speech-video';
const tokens = ['auth_token', 'user_manager_token', 'unityshop-main-frontend-token', 'admin_token'];

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const choices = tokens.map((key) => localStorage.getItem(key)).filter(Boolean);
  let response: Response | undefined;
  for (const token of choices.length ? choices : ['']) {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(`${prefix}${path}`, { ...init, headers, credentials: 'same-origin' });
    if (response.status !== 401) break;
  }
  const text = await response!.text();
  let result: any;
  try { result = JSON.parse(text); } catch { throw new Error(`服务返回了无效响应（HTTP ${response!.status}）。`); }
  if (!response!.ok || result?.success === false) throw new Error(result?.message || `请求失败（HTTP ${response!.status}）。`);
  return result.data as T;
}
function action<T>(name: string, input: Record<string, unknown> = {}, billed = false): Promise<T> {
  return request<T>(billed ? '/api/execute/run' : '/api/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, ...input }),
  });
}
function upload(file: File): Promise<Image> {
  return request<{ id: string; url: string }>('/api/execute/local-assets', {
    method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file,
  });
}
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

export default function App() {
  const [images, setImages] = useState<Image[]>([]);
  const [sample, setSample] = useState<Image | null>(null);
  const [voiceId, setVoiceId] = useState('');
  const [script, setScript] = useState('');
  const [direction, setDirection] = useState('');
  const [pointsPerSecond, setPointsPerSecond] = useState<number | null>(null);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [video, setVideo] = useState('');
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);
  useEffect(() => {
    void request<{ videoPointsPerSecond: number | null }>('/api/health', { method: 'GET' })
      .then((result) => setPointsPerSecond(result.videoPointsPerSecond))
      .catch(() => setPointsPerSecond(null));
  }, []);
  const resetAudio = () => { setAudio(null); setVideo(''); setJobId(''); };

  async function onImages(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    if (images.length + files.length > 1) { setError('OmniHuman 仅支持1张人物参考图片。'); return; }
    if (Array.from(files).some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('请上传 JPG、PNG 或 WebP 图片。'); return; }
    if (Array.from(files).some((file) => file.size >= 5 * 1024 * 1024)) { setError('人物图片须小于5MB，请压缩后重试。'); return; }
    setBusy('上传参考图片');
    try {
      const results = await Promise.all(Array.from(files).map(upload));
      setImages((current) => [...current, ...results]); setVideo(''); setJobId('');
    } catch (err) { setError(message(err)); } finally { setBusy(''); }
  }

  async function onSample(file?: File) {
    if (!file) return;
    setBusy('上传并复刻音色'); setError(''); resetAudio(); setVoiceId('');
    try {
      const result = await upload(file);
      setSample(result);
      const voice = await action<{ voiceId: string }>('enroll_voice', { sampleId: result.id });
      setVoiceId(voice.voiceId);
    } catch (err) { setError(message(err)); } finally { setBusy(''); }
  }

  async function prepare() {
    if (!script.trim() || !voiceId) { setError('请先输入台词并上传声音样本。'); return; }
    setBusy('生成口播音频'); setError(''); resetAudio();
    try { setAudio(await action<Audio>('prepare_audio', { script: script.trim(), voiceId }, true)); }
    catch (err) { setError(message(err)); } finally { setBusy(''); }
  }

  async function poll(id: string) {
    try {
      const result = await action<{ status: string; error?: string }>('get_clone_job', { jobId: id });
      if (result.status === 'failed') throw new Error(result.error || '视频生成失败，请更换素材后重试。');
      if (result.status === 'completed') {
        setStatus('正在合成最终音轨');
        const final = await action<{ videoUrl: string }>('finalize_video', { jobId: id });
        setVideo(final.videoUrl); setStatus('生成完成'); return;
      }
      setStatus(result.status === 'queued' ? '排队中' : '生成视频中');
      pollRef.current = setTimeout(() => void poll(id), 4000);
    } catch (err) { setError(message(err)); setStatus('生成失败'); }
  }

  async function generate() {
    if (!images.length || !audio) { setError('请上传参考图片并先生成口播音频。'); return; }
    setBusy('提交视频任务'); setError(''); setVideo('');
    try {
      const input = { imageIds: images.map((image) => image.id), audioId: audio.audioId, direction };
      const job = await action<{ jobId: string }>('start_clone_job', input, true);
      setJobId(job.jobId); setStatus('排队中'); void poll(job.jobId);
    } catch (err) { setError(message(err)); setStatus('提交失败'); }
    finally { setBusy(''); }
  }

  const generating = Boolean(jobId) && status !== '生成完成' && status !== '生成失败' && status !== '提交失败';
  const locked = generating || !!busy;
  const priced = pointsPerSecond !== null && videoPricingConfigured(pointsPerSecond);
  return <main className="shell">
    <header><div className="eyebrow">AI SPEECH STUDIO</div><h1>数字人口播</h1><p>用一张形象照和一段口播音频，生成自然开口的数字人视频。</p></header>
    <div className="grid">
      <section className="card">
        <div className="step"><span>01</span><div><h2>人物参考</h2><p>上传1张清晰正面照（小于5MB，宽高小于4096像素）。</p></div></div>
        <div className="photos">{images.map((image, index) => <div className="photo" key={image.id}><img src={image.url} alt={`人物参考${index + 1}`} /><button type="button" disabled={locked} aria-label="移除参考图片" onClick={() => { setImages(images.filter((entry) => entry.id !== image.id)); setVideo(''); setJobId(''); }}>×</button></div>)}
          {images.length < 1 && <label className="add-photo"><strong>＋</strong><span>添加照片</span><input type="file" disabled={locked} accept="image/png,image/jpeg,image/webp" onChange={(e) => { void onImages(e.target.files); e.target.value = ''; }} /></label>}</div>
        <div className="divider" />
        <div className="step"><span>02</span><div><h2>口播内容</h2><p>输入人物要说的话。超过15秒的语音仅使用前15秒。</p></div></div>
        <textarea value={script} disabled={locked} maxLength={3000} placeholder="例如：你好，欢迎来到我的频道，今天带你了解..." onChange={(e) => { setScript(e.target.value); resetAudio(); }} />
        <label className="field-label" htmlFor="direction">画面要求 <small>可选</small></label>
        <input id="direction" value={direction} disabled={locked} maxLength={270} placeholder="例如：人物平静地面对镜头说话，镜头稳定" onChange={(e) => { setDirection(e.target.value); setVideo(''); setJobId(''); }} />
        <div className="divider" />
        <div className="step"><span>03</span><div><h2>生成口播声音</h2><p>上传已获授权的单人声音样本（建议10至20秒，最大10MB）。</p></div></div>
        <label className="upload-voice">{sample ? '更换声音样本' : '选择 MP3 / WAV / M4A 声音样本'}<input type="file" disabled={locked} accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4" onChange={(e) => { void onSample(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {voiceId && <p className="success">音色已就绪，可以生成语音。</p>}
        <button className="secondary" disabled={!!busy || !voiceId || !script.trim() || generating} onClick={() => void prepare()}>{busy === '生成口播音频' ? '声音生成中…' : '生成并试听声音（2积分）'}</button>
        {audio && <div className="preview"><div className="preview-title">口播音频 · {audio.seconds.toFixed(1)}秒</div><audio controls src={audio.audioUrl} />{audio.warning && <p className="warning">{audio.warning}</p>}</div>}
        {error && <p role="alert" className="error">{error}</p>}
        {jobId && status === '生成失败' && <button className="secondary" onClick={() => { setError(''); setStatus('重新查询任务'); void poll(jobId); }}>重试查询 / 合成成片</button>}
        {busy && busy !== '生成口播音频' && <p className="notice">{busy}，请稍候…</p>}
        <p className="fine-print">视频模型：OmniHuman 1.5 · 1080p 画质模式。</p>
        <button className="primary" disabled={!!busy || generating || !audio || !images.length || !priced} onClick={() => void generate()}>{generating ? status + '…' : `生成口播视频${audio && priced ? `（${videoPointCost(audio.durationSeconds, pointsPerSecond!)}积分）` : ''}`}</button>
        {!priced && <p className="warning">视频积分价格尚未配置，暂不能提交视频任务。</p>}
        <p className="fine-print">人物与声音素材请确保拥有使用授权。</p>
      </section>
      <aside className="card result"><div className="step"><span>04</span><div><h2>成片预览</h2><p>视频完成后，将自动使用刚才试听的语音作为最终音轨。</p></div></div>
        <div className="screen">{video ? <VideoPreviewPlayer url={video} /> : <div className="empty"><div className="play-icon">▶</div><strong>{status || '等待生成'}</strong><p>{generating ? '视频生成通常需要几分钟，请保持页面打开。' : '生成的视频会显示在这里'}</p></div>}</div>
        {video && <a className="download" href={video} download="数字人口播.mp4">下载视频 MP4 ↓</a>}
      </aside>
    </div>
  </main>;
}
