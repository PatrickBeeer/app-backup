import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// 147ai 中转 Gemini 代理（图片生成）
// 把前端发来的 /api/gemini/generate（Gemini 原生请求体）转成 147ai 的
// /chat/completions 调用，再把返回的图片回传给浏览器。
// 仅在 task === 'image_gen' 且 model 以 'gemini-' 开头时接管请求。
// ---------------------------------------------------------------------------

async function readJsonBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// 请求体流只能消费一次，把解析结果缓存到 req 上供多个中间件复用。
async function readCachedJsonBody(req: any): Promise<any> {
  if (!req.__cachedJsonBody) {
    req.__cachedJsonBody = await readJsonBody(req);
  }
  return req.__cachedJsonBody;
}

function sendJson(res: any, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function buildArkChatMessages(body: any): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  const systemText = body?.systemInstruction?.parts
    ?.map((part: any) => String(part?.text || ''))
    .filter(Boolean)
    .join('\n') || '';
  if (systemText) {
    messages.push({ role: 'system', content: systemText });
  }

  const parts: any[] = Array.isArray(body?.contents?.parts) ? body.contents.parts : [];
  const userContent: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      userContent.push({ type: 'text', text: part.text });
      continue;
    }
    if (part?.inlineData?.data) {
      const mimeType = String(part.inlineData.mimeType || 'image/jpeg');
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${part.inlineData.data}` },
      });
    }
  }

  if (userContent.length === 0) {
    userContent.push({ type: 'text', text: '' });
  }

  messages.push({ role: 'user', content: userContent });
  return messages;
}

function extractGemini147Image(content: string): string | null {
  const markdownMatch = content.match(/!\[[^\]]*\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)\)/);
  if (markdownMatch) return markdownMatch[1];
  const dataMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
  if (dataMatch) return dataMatch[0];
  return null;
}

function createGemini147Proxy(env: Record<string, string>) {
  const textKey = String(env.GEMINI_147AI_TEXT_KEY || '').trim();
  const imageKey = String(env.GEMINI_147AI_IMAGE_KEY || '').trim();
  const baseUrl = String(env.GEMINI_147AI_BASE_URL || 'https://147ai.com/v1').replace(/\/+$/, '');

  const requestChat = async (apiKey: string, payload: Record<string, unknown>): Promise<any> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `147ai API HTTP ${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    name: 'gemini-147ai-local-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/gemini/generate', async (req, res, next) => {
        if (req.method !== 'POST') return next();

        let body: any;
        try {
          body = await readCachedJsonBody(req);
        } catch {
          return next();
        }

        const model = String(body?.model || '').trim();
        const task = String(body?.task || '').trim();
        if (!model.startsWith('gemini-')) return next();
        if (task !== 'text_gen' && task !== 'image_gen') return next();

        const apiKey = task === 'image_gen' ? imageKey : textKey;
        if (!apiKey) {
          return sendJson(res, 500, { message: `请在 .env.local 中配置 ${task === 'image_gen' ? 'GEMINI_147AI_IMAGE_KEY' : 'GEMINI_147AI_TEXT_KEY'}` });
        }

        try {
          const upstream = await requestChat(apiKey, {
            model,
            messages: buildArkChatMessages(body),
          });
          const content = upstream?.choices?.[0]?.message?.content;
          const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
              ? content.map((item: any) => String(item?.text || '')).join('')
              : '';

          if (task === 'text_gen') {
            return sendJson(res, 200, { text });
          }

          const imageUrl = extractGemini147Image(text);
          if (imageUrl) {
            return sendJson(res, 200, { imageUrl });
          }
          return sendJson(res, 502, { message: `图片生成失败：${text.slice(0, 300) || '未返回图片'}` });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return sendJson(res, 504, { message: 'AI 服务响应超时（超过 180 秒），请重试。' });
          }
          return sendJson(res, 502, { message: error instanceof Error ? error.message : '147ai API 请求失败' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: '/standalone/image-angle-control/',
    plugins: [react(), tailwindcss(), createGemini147Proxy(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // 允许引用项目根目录之外的 shared_services（位于上级 app应用工具 目录）。
      fs: {
        allow: [__dirname, path.resolve(__dirname, '../..')],
      },
    },
  };
});
