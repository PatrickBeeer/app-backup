import { describe, expect, it } from 'vitest';
import {
  CprtProvider,
  buildImageFallbackPayload,
  buildMultimodalPayload
} from '../src/providers/cprt.js';

describe('CPRT request contract', () => {
  it('builds a Seedance 2.5 content[] payload with text, reference images, and reference video', () => {
    const body = buildMultimodalPayload({
      presenterMode: 'reference',
      personUrls: ['p1', 'p2', 'p3'],
      productUrls: ['sku1'],
      referenceVideoUrl: 'reference.mp4',
      prompt: 'new script',
      ratio: '9:16',
      requestDuration: 6
    });

    expect(body.model).toBe('XG-MASTER-VIDEO-2.5');
    expect(body.generate_audio).toBe(true);
    expect(body.ratio).toBe('9:16');
    expect(body.duration).toBe(6);
    expect(body.content.map((c) => c.type)).toEqual([
      'text', 'image_url', 'image_url', 'image_url', 'image_url', 'video_url'
    ]);
    expect(body.content[0]).toEqual({ type: 'text', text: 'new script' });

    const imageItems = body.content.filter((c) => c.type === 'image_url');
    expect(imageItems.map((c) => c.image_url?.url)).toEqual(['p1', 'p2', 'p3', 'sku1']);
    expect(imageItems.every((c) => c.role === 'reference_image')).toBe(true);

    const videoItem = body.content.find((c) => c.type === 'video_url');
    expect(videoItem?.video_url?.url).toBe('reference.mp4');
    expect(videoItem?.role).toBe('reference_video');
  });

  it('omits person images when the model generates the presenter', () => {
    const body = buildMultimodalPayload({
      presenterMode: 'generated',
      personUrls: [],
      productUrls: ['sku1'],
      referenceVideoUrl: 'reference.mp4',
      prompt: 'new short-sleeve script',
      ratio: '9:16',
      requestDuration: 12
    });

    expect(body.duration).toBe(12);
    expect(body.content.map((c) => c.type)).toEqual(['text', 'image_url', 'video_url']);
    expect(body.content[1]?.image_url?.url).toBe('sku1');
    expect(body.content[1]?.role).toBe('reference_image');
    expect(body.content[2]?.video_url?.url).toBe('reference.mp4');
    expect(body.content[2]?.role).toBe('reference_video');
  });

  it('honors an explicit model override and clamps duration into the 4..15 range', () => {
    const body = buildMultimodalPayload({
      presenterMode: 'reference',
      personUrls: ['p1'],
      productUrls: [],
      referenceVideoUrl: 'reference.mp4',
      prompt: 'script',
      ratio: '16:9',
      requestDuration: 99,
      model: 'custom-model-x'
    });

    expect(body.model).toBe('custom-model-x');
    expect(body.duration).toBe(15);
    expect(body.ratio).toBe('16:9');
  });

  it('builds a first-and-last-frame i2v payload (no ratio) for XG-MASTER fallback', () => {
    const body = buildImageFallbackPayload({
      firstFrameUrl: 'first.jpg',
      lastFrameUrl: 'last.jpg',
      prompt: 'fallback',
      requestDuration: 4
    });

    expect(body.model).toBe('XG-MASTER-VIDEO-2.5');
    expect(body.generate_audio).toBe(true);
    expect(body.duration).toBe(4);
    expect(body.ratio).toBeUndefined(); // i2v: ratio follows the first-frame image
    expect(body.content.map((c) => c.type)).toEqual(['text', 'image_url', 'image_url']);
    expect(body.content[1]).toEqual({
      type: 'image_url', image_url: { url: 'first.jpg' }, role: 'first_frame'
    });
    expect(body.content[2]).toEqual({
      type: 'image_url', image_url: { url: 'last.jpg' }, role: 'last_frame'
    });
  });

  it('builds a first-frame-only i2v payload when no last frame is supplied', () => {
    const body = buildImageFallbackPayload({
      firstFrameUrl: 'first.jpg',
      prompt: 'fallback',
      requestDuration: 6
    });

    expect(body.content.map((c) => c.type)).toEqual(['text', 'image_url']);
    expect(body.content[1]?.role).toBe('first_frame');
    expect(body.ratio).toBeUndefined();
  });

  it('normalizes task creation and successful query responses', async () => {
    const responses = [
      new Response(JSON.stringify({ taskId: 'remote-42', status: 'QUEUED' }), { status: 200 }),
      new Response(JSON.stringify({
        taskId: 'remote-42',
        status: 'SUCCESS',
        results: [
          { url: 'https://cdn.example/result.mp4', outputType: 'mp4', name: 'videoUrl' },
          { text: '1234', outputType: 'text', name: 'seed' }
        ]
      }), { status: 200 })
    ];
    const provider = new CprtProvider(
      { baseUrl: 'https://ai-api.cprt.xyz', apiKey: 'test-key' },
      async () => responses.shift()!
    );
    const payload = buildImageFallbackPayload({
      firstFrameUrl: 'first.jpg', prompt: 'test', requestDuration: 4
    });

    await expect(provider.submit(payload)).resolves.toEqual({ taskId: 'remote-42' });
    await expect(provider.query('remote-42')).resolves.toEqual({
      taskId: 'remote-42', status: 'SUCCESS', videoUrl: 'https://cdn.example/result.mp4', rawStatus: 'SUCCESS'
    });
  });

  it('surfaces protocol errors when creation succeeds without a task id', async () => {
    const provider = new CprtProvider(
      { baseUrl: 'https://ai-api.cprt.xyz', apiKey: 'test-key' },
      async () => new Response(JSON.stringify({ status: 'QUEUED' }), { status: 200 })
    );
    const payload = buildImageFallbackPayload({
      firstFrameUrl: 'first.jpg', prompt: 'test', requestDuration: 4
    });

    await expect(provider.submit(payload)).rejects.toThrow('任务 ID');
  });

  it('drills into nested {error:{message}} bodies when submit fails', async () => {
    const provider = new CprtProvider(
      { baseUrl: 'https://ai-api.cprt.xyz', apiKey: 'test-key' },
      async () => new Response(JSON.stringify({
        error: { code: '5000', message: '上游返回的任务id为空, 请检查入参' }
      }), { status: 503 })
    );
    const payload = buildImageFallbackPayload({
      firstFrameUrl: 'first.jpg', prompt: 'test', requestDuration: 4
    });

    await expect(provider.submit(payload)).rejects.toThrow('上游返回的任务id为空');
  });
});
