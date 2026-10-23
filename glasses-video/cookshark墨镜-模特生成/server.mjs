import dotenv from 'dotenv';
import express from 'express';

const sourceVideoEnvPath = `I:\\${String.fromCodePoint(0x684c, 0x9762)}\\${String.fromCodePoint(0x773c, 0x955c, 0x89c6, 0x9891)}\\.env`;
dotenv.config({ path: sourceVideoEnvPath });

dotenv.config({ path: ['.env.local', 'I:\\桌面\\眼镜视频\\.env'] });

const app = express();
const port = Number(process.env.VIDEO_PORT || 8787);
const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
const model = process.env.ARK_MODEL_ID || 'doubao-seedance-2-0-fast-260128';

app.use(express.json({ limit: '30mb' }));

app.get('/api/video/health', (_req, res) => {
  res.json({ ok: true, mode: process.env.ARK_API_KEY ? 'ark' : 'demo', model, baseUrl });
});

app.post('/api/video/generate', async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  const ratio = req.body.ratio === '16:9' ? '16:9' : '9:16';
  const duration = Math.min(15, Math.max(5, Number(req.body.duration) || 5));
  const resolution = req.body.resolution === '1080p' ? '1080p' : '720p';
  const images = Array.isArray(req.body.imageDataUrls) ? req.body.imageDataUrls : [];

  if (!prompt) return res.status(400).json({ error: '导演指令不能为空' });
  if (!images.length) return res.status(400).json({ error: '请至少上传一张产品图片' });

  if (!process.env.ARK_API_KEY) {
    return res.json({ mode: 'demo', taskId: `demo-${Date.now()}`, status: 'queued' });
  }

  const content = [{
    type: 'text',
    // Ark 需要在文本末尾使用命令参数才会严格执行比例和时长。
    text: `${prompt}\n输出清晰度为${resolution}。 --ratio ${ratio} --dur ${duration}`,
  }];
  images.filter((url) => typeof url === 'string' && url.startsWith('data:image/')).slice(0, 9).forEach((url) => {
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  });

  try {
    const upstream = await fetch(`${baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ARK_API_KEY}` },
      body: JSON.stringify({ model, content, generate_audio: false }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.error?.message || data.message || '视频任务创建失败', requestId: data.request_id || data.requestId });
    return res.json({ mode: 'ark', ...data, id: data.taskId || data.id, status: data.status || 'queued' });
  } catch (error) {
    return res.status(502).json({ error: error.message || '视频服务暂时不可用' });
  }
});

async function resolveTask(id) {
  if (id.startsWith('demo-')) {
    const age = Date.now() - Number(id.split('-')[1] || Date.now());
    const status = age > 9000 ? 'succeeded' : age > 2500 ? 'running' : 'queued';
    return { mode: 'demo', id, status, content: status === 'succeeded' ? { video_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' } : undefined };
  }
  const response = await fetch(`${baseUrl}/contents/generations/tasks/${id}`, { headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` } });
  const data = await response.json();
  return { status: response.status, data };
}

app.get('/api/video/tasks/:id', async (req, res) => {
  try {
    const result = await resolveTask(req.params.id);
    if (result.data) return res.status(result.status).json(result.data);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message || '视频任务查询失败' });
  }
});

app.get('/api/video/tasks/:id/video', async (req, res) => {
  try {
    const result = await resolveTask(req.params.id);
    const videoUrl = result.data?.content?.video_url || result.data?.video_url || result.content?.video_url;
    if (!videoUrl) return res.status(404).json({ error: '视频还未准备好' });
    const upstream = await fetch(videoUrl, { headers: req.headers.range ? { Range: req.headers.range } : {} });
    if (!upstream.ok && upstream.status !== 206) return res.status(upstream.status).end();
    res.status(upstream.status);
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (!upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
    return res.end();
  } catch (error) {
    return res.status(502).json({ error: error.message || '视频预览代理失败' });
  }
});

app.listen(port, '127.0.0.1', () => console.log(`Video API listening on http://127.0.0.1:${port}`));
