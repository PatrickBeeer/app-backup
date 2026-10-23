// TokenDance (seedance2 引擎) provider：直接 fetch，不走本地桥接。
// 端点：POST ${baseUrl}/generations/tasks（提交）/ GET ${baseUrl}/generations/tasks/:id（查询）。
// data: URL 的视频素材通过 assetTunnel.publishDataUrl 发布成公网 URL 后再传给上游。

import type { KlingAssetTunnel } from './klingAssetTunnel';

type TokendanceHttpResult = { ok: boolean; status: number; text: string };

export type TokendanceGenerateResult = { status: number; payload: any };

async function requestTokendance(
  url: string,
  method: 'GET' | 'POST',
  bearerToken: string,
  body?: string,
): Promise<TokendanceHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 处理 POST /api/gemini/generate 且 provider='seedance2' 的请求。
 * taskId 存在时走查询，否则走提交。返回 { status, payload }，由 server.ts 转发。
 */
export async function submitOrQueryTokendance(input: {
  bearerToken: string;
  baseUrl: string;
  model: string;
  body: any;
  assetTunnel: KlingAssetTunnel;
}): Promise<TokendanceGenerateResult> {
  const { bearerToken, baseUrl, model, body, assetTunnel } = input;
  const taskId = String(body?.config?.taskId || '').trim();
  const endpoint = taskId
    ? `${baseUrl}/generations/tasks/${encodeURIComponent(taskId)}`
    : `${baseUrl}/generations/tasks`;

  // 把 content[] 里的 data: URL 视频发布成公网 URL，并把 text 截断到 2500 字符。
  const content = Array.isArray(body?.contents?.content)
    ? await Promise.all(body.contents.content.map(async (item: any) => {
        if (item?.type === 'image_url' && item?.image_url?.url) {
          return item;
        }
        if (item?.type === 'video_url' && item?.video_url?.url) {
          const videoUrl = String(item.video_url.url || '').trim();
          if (!videoUrl.startsWith('data:')) return item;
          const publicVideoUrl = await assetTunnel.publishDataUrl(videoUrl);
          return { ...item, video_url: { ...item.video_url, url: publicVideoUrl } };
        }
        if (item?.type === 'text') {
          return { ...item, text: String(item.text || '').slice(0, 2500) };
        }
        return item;
      }))
    : [];

  const requestBody = taskId
    ? undefined
    : JSON.stringify({
        model,
        content,
        ratio: body?.config?.aspectRatio || '9:16',
        resolution: '720p',
        duration: Math.min(15, Math.max(2, Math.round(Number(body?.config?.durationSeconds) || 5))),
        generate_audio: true,
        watermark: false,
      });

  let upstream: TokendanceHttpResult;
  try {
    upstream = await requestTokendance(endpoint, taskId ? 'GET' : 'POST', bearerToken, requestBody);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown';
    return {
      status: 502,
      payload: { message: `连接 TokenDance API 失败：${detail}` },
    };
  }

  let payload: any;
  try {
    payload = upstream.text ? JSON.parse(upstream.text) : {};
  } catch {
    payload = { message: upstream.text };
  }
  if (!upstream.ok) {
    return {
      status: upstream.status || 502,
      payload: {
        ...payload,
        message: String(payload?.error?.message || payload?.message || `TokenDance API 请求失败（HTTP ${upstream.status}）`),
      },
    };
  }
  return { status: 200, payload };
}
