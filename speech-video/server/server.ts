import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from './config';
import { assetPath, previewUrl, providerUrl, saveAsset } from './assets';
import { cropAudio, duration, muxVideo, narrationPolicy, validatePortrait } from './media';
import { enrollVoice, synthesize, videoStatus } from './provider';
import { OMNIHUMAN_MODEL, OMNIHUMAN_RESOLUTION, omnihumanStatus, startOmnihuman } from './omnihuman';
import { referenceAudioForVideo } from './referenceAudio';
import { videoPointCost, videoPricingConfigured } from '../shared/omnihumanPricing';

type Prepared = { audioId: string; script: string; seconds: number; durationSeconds: number; cropped: boolean };
type Job = { audioId: string; videoId?: string; provider?: 'omnihuman' };
const prepared = new Map<string, Prepared>();
const jobs = new Map<string, Job>();
const stateFile = path.join(config.storageDir, 'jobs.json');
try {
  const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  for (const [id, entry] of Object.entries(data.prepared || {})) prepared.set(id, entry as Prepared);
  for (const [id, entry] of Object.entries(data.jobs || {})) jobs.set(id, entry as Job);
} catch { /* First launch. */ }
function persist(): void {
  fs.mkdirSync(config.storageDir, { recursive: true });
  const temporary = `${stateFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ prepared: Object.fromEntries(prepared), jobs: Object.fromEntries(jobs) }));
  fs.renameSync(temporary, stateFile);
}

function reply(res: ServerResponse, code: number, data: unknown, message = ''): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ success: code < 400, data, message }));
}
function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${label}。`);
  return value.trim();
}
async function body(req: IncomingMessage, max = 128 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('上传文件太大。');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function validateImageIds(value: unknown): Promise<string> {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('请选择1张清晰的人物参考图片。');
  const id: unknown = value[0];
  if (typeof id !== 'string' || !/\.(png|jpe?g|webp)$/.test(id)) throw new Error('参考图片格式不支持。');
  await validatePortrait(assetPath(id));
  return id;
}
async function validatedInput(data: Record<string, unknown>): Promise<{ audio: Prepared; imageId: string; direction: string }> {
  const id = required(data.audioId, '生成的口播音频');
  const audio = prepared.get(id);
  if (!audio || !fs.existsSync(assetPath(audio.audioId))) throw new Error('口播音频已失效，请重新生成语音。');
  if (!Number.isFinite(audio.seconds) || audio.seconds < 4 || !Number.isInteger(audio.durationSeconds)
    || audio.durationSeconds < 4 || audio.durationSeconds > 15
    || audio.seconds > audio.durationSeconds + 0.15) throw new Error('口播音频须为4至15秒。');
  const direction = typeof data.direction === 'string' ? data.direction.trim().slice(0, 270) : '';
  return { audio, imageId: await validateImageIds(data.imageIds), direction };
}

async function dispatch(data: Record<string, unknown>): Promise<unknown> {
  switch (data.action) {
    case 'health':
      return {
        model: OMNIHUMAN_MODEL, resolution: OMNIHUMAN_RESOLUTION,
        videoPointsPerSecond: videoPricingConfigured(config.videoPointsPerSecond) ? config.videoPointsPerSecond : null,
      };
    case 'enroll_voice': {
      const id = required(data.sampleId, '声音样本');
      if (!/\.(mp3|wav|m4a)$/.test(id)) throw new Error('请选择 MP3、WAV 或 M4A 声音样本。');
      const url = await providerUrl(id);
      return { voiceId: await enrollVoice(url) };
    }
    case 'prepare_audio': {
      const script = required(data.script, '口播台词');
      const voiceId = required(data.voiceId, '复刻音色');
      if (script.length > 3000 || !/^[\w.-]{1,255}$/.test(voiceId)) throw new Error('台词过长或音色 ID 无效。');
      const audio = await synthesize(script, voiceId);
      if (!audio.length || audio.length > 20 * 1024 * 1024) throw new Error('百炼返回的音频无效。');
      const originalId = saveAsset('speech.mp3', audio);
      const originalPath = assetPath(originalId);
      const seconds = await duration(originalPath);
      let policy: ReturnType<typeof narrationPolicy>;
      try {
        policy = narrationPolicy(seconds);
      } catch (error) {
        await fsp.rm(originalPath, { force: true });
        throw error;
      }
      let id = originalId;
      if (policy.cropped) {
        id = saveAsset('prepared.wav', Buffer.alloc(0));
        try {
          await cropAudio(originalPath, assetPath(id), policy.durationSeconds);
        } catch (error) {
          await fsp.rm(assetPath(id), { force: true });
          throw error;
        } finally {
          await fsp.rm(originalPath, { force: true });
        }
      }
      const usedSeconds = await duration(assetPath(id));
      if (usedSeconds > policy.durationSeconds + 0.001) {
        await fsp.rm(assetPath(id), { force: true });
        throw new Error('口播音频超出视频时长，请重新生成语音。');
      }
      const result: Prepared = { audioId: id, script, seconds: usedSeconds, durationSeconds: policy.durationSeconds, cropped: policy.cropped };
      prepared.set(id, result);
      persist();
      return { ...result, audioUrl: previewUrl(id), warning: result.cropped ? '音频超过15秒，本次视频仅使用前15秒，后续内容不会出现在成片中。' : null };
    }
    case 'quote_clone_job': {
      const { audio } = await validatedInput(data);
      return {
        model: OMNIHUMAN_MODEL, resolution: OMNIHUMAN_RESOLUTION, durationSeconds: audio.durationSeconds,
        images: 1, pointCost: videoPointCost(audio.durationSeconds, config.videoPointsPerSecond),
      };
    }
    case 'start_clone_job': {
      const { audio, imageId, direction } = await validatedInput(data);
      const pointCost = videoPointCost(audio.durationSeconds, config.videoPointsPerSecond);
      const audioId = await referenceAudioForVideo(audio.audioId, audio.durationSeconds);
      const imageUrl = await providerUrl(imageId);
      const audioUrl = await providerUrl(audioId);
      const id = await startOmnihuman(imageUrl, audioUrl, direction);
      jobs.set(id, { audioId, provider: 'omnihuman' });
      persist();
      return { jobId: id, status: 'queued', pointCost };
    }
    case 'get_clone_job': {
      const id = required(data.jobId, '任务编号');
      const job = jobs.get(id);
      if (!job) throw new Error('未找到视频任务。');
      if (job.videoId) return { status: 'completed', videoUrl: previewUrl(job.videoId), jobId: id };
      const status = job.provider === 'omnihuman' ? await omnihumanStatus(id) : await videoStatus(id);
      return { ...status, jobId: id, videoUrl: null };
    }
    case 'finalize_video': {
      const id = required(data.jobId, '任务编号');
      const job = jobs.get(id);
      if (!job) throw new Error('未找到视频任务。');
      if (job.videoId) return { videoUrl: previewUrl(job.videoId), audioReplaced: true };
      const status = job.provider === 'omnihuman' ? await omnihumanStatus(id) : await videoStatus(id);
      if (status.status !== 'completed' || !status.videoUrl) throw new Error('视频尚未生成完成。');
      const videoId = saveAsset('final.mp4', Buffer.from([]));
      try {
        await muxVideo(status.videoUrl, assetPath(job.audioId), assetPath(videoId));
        job.videoId = videoId;
        persist();
      } catch (error) {
        await fsp.rm(assetPath(videoId), { force: true });
        throw error;
      }
      return { videoUrl: previewUrl(videoId), audioReplaced: true };
    }
    default:
      throw new Error('未知请求操作。');
  }
}

function contentType(id: string): string {
  const ext = path.extname(id);
  return ({ '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.m4a': 'audio/mp4' } as Record<string, string>)[ext] || 'application/octet-stream';
}
const server = createServer(async (req, res) => {
  try {
    const route = (req.url || '').split('?')[0].replace(/^\/standalone\/speech-video/, '');
    if ((req.method === 'GET' || req.method === 'HEAD') && route.startsWith('/api/output/')) {
      const id = decodeURIComponent(route.slice('/api/output/'.length));
      const file = assetPath(id);
      const size = fs.statSync(file).size;
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start >= size || end < start) { res.writeHead(416); res.end(); return; }
      res.writeHead(range ? 206 : 200, { 'Content-Type': contentType(id), 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    if (req.method === 'POST' && route === '/api/execute/local-assets') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || 'asset'));
      const type = String(req.headers['content-type'] || '');
      if (!/^(image\/(jpeg|png|webp)|audio\/(mpeg|mp3|wav|x-wav|mp4|x-m4a))$/.test(type)) throw new Error('请上传 JPG、PNG、WebP 图片或 MP3、WAV、M4A 声音样本。');
      const bytes = await body(req, type.startsWith('image/') ? 5 * 1024 * 1024 : 10 * 1024 * 1024);
      if (!bytes.length) throw new Error('上传文件不能为空。');
      const id = saveAsset(name, bytes);
      if (type.startsWith('image/')) {
        try { await validatePortrait(assetPath(id)); }
        catch (error) { await fsp.rm(assetPath(id), { force: true }); throw error; }
      }
      reply(res, 200, { id, url: previewUrl(id) });
      return;
    }
    if (req.method === 'GET' && route === '/api/health') { reply(res, 200, await dispatch({ action: 'health' })); return; }
    if (req.method === 'POST' && (route === '/api/run' || route === '/api/execute/run')) {
      const data = JSON.parse((await body(req)).toString('utf8')) as Record<string, unknown>;
      reply(res, 200, await dispatch(data));
      return;
    }
    reply(res, 404, null, '未找到请求地址。');
  } catch (error) {
    console.error('[speech-video]', error);
    reply(res, 400, null, error instanceof Error ? error.message : '操作失败，请重试。');
  }
});
server.listen(config.port, '127.0.0.1', () => console.log(`[speech-video] BFF: 127.0.0.1:${config.port}`));

createServer((req, res) => {
  try {
    const id = decodeURIComponent((req.url || '').split('?')[0].replace(/^\/assets\//, ''));
    const file = assetPath(id);
    res.writeHead(200, { 'Content-Type': contentType(id), 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
}).listen(config.assetPort, '127.0.0.1', () => console.log(`[speech-video] assets: 127.0.0.1:${config.assetPort}`));
