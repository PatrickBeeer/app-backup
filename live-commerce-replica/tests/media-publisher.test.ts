import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MissingMediaPublisher,
  PlatformMediaPublisher,
  PublicBaseMediaPublisher
} from '../src/providers/media-publisher.js';
import type { PlatformClient, PresignCOSUploadRequest, PresignCOSUploadResult } from '../src/providers/platformClient.js';

describe('PublicBaseMediaPublisher', () => {
  it('maps a data file to an encoded public media URL', async () => {
    const dataDir = path.resolve('data');
    const publisher = new PublicBaseMediaPublisher(dataDir, 'https://public.example/app/');
    const filePath = path.join(dataDir, 'projects', '项目 1', 'reference clip.mp4');

    await expect(publisher.publish(filePath, 'Bearer test')).resolves.toBe(
      'https://public.example/app/media/projects/%E9%A1%B9%E7%9B%AE%201/reference%20clip.mp4'
    );
  });

  it('rejects files outside the configured data directory', async () => {
    const publisher = new PublicBaseMediaPublisher(path.resolve('data'), 'https://public.example');

    await expect(publisher.publish(path.resolve('outside.mp4'), 'Bearer test')).rejects.toThrow('媒体目录');
  });
});

describe('PlatformMediaPublisher', () => {
  function fakePresign(): PresignCOSUploadResult {
    return {
      bucket_name: 'test-bucket',
      region: 'ap-guangzhou',
      object_key: 'user_storage/test/standalone/live-commerce-replica/jingke/file.mp4',
      public_url: 'https://test.cos.example/public/file.mp4',
      signed_url: 'https://test.cos.example/signed/file.mp4',
      upload_url: 'https://test.cos.example/upload/file.mp4',
      url: 'https://test.cos.example/url/file.mp4'
    };
  }

  function fakeClient(): PlatformClient & { calls: Array<{ req: PresignCOSUploadRequest; auth: string }> } {
    const calls: Array<{ req: PresignCOSUploadRequest; auth: string }> = [];
    const client = {
      calls,
      presignCOSUpload: vi.fn(async (req: PresignCOSUploadRequest, auth: string) => {
        calls.push({ req, auth });
        return fakePresign();
      }),
      uploadBytes: vi.fn(async () => 'https://test.cos.example/signed/file.mp4')
    } as unknown as PlatformClient & { calls: Array<{ req: PresignCOSUploadRequest; auth: string }> };
    return client;
  }

  it('throws when auth is missing', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-platform-'));
    const filePath = path.join(dataDir, 'person.jpg');
    writeFileSync(filePath, Buffer.from('jpg-fixture'));
    const publisher = new PlatformMediaPublisher({
      platformClient: fakeClient(),
      objectPathPrefix: 'standalone/live-commerce-replica/jingke'
    });

    await expect(publisher.publish(filePath, '')).rejects.toThrow('Authorization');
  });

  it('presigns and uploads via PlatformClient, returning the signed URL', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-platform-'));
    const filePath = path.join(dataDir, 'person.jpg');
    writeFileSync(filePath, Buffer.from('jpg-fixture'));
    const client = fakeClient();
    const publisher = new PlatformMediaPublisher({ platformClient: client, objectPathPrefix: 'standalone/live-commerce-replica/jingke' });

    const url = await publisher.publish(filePath, 'Bearer test-token');

    expect(url).toBe('https://test.cos.example/signed/file.mp4');
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.auth).toBe('Bearer test-token');
    expect(client.calls[0]?.req).toEqual(expect.objectContaining({
      fileName: 'person.jpg',
      contentType: 'image/jpeg',
      objectPath: expect.stringMatching(/^standalone\/live-commerce-replica\/jingke\/\d+-person\.jpg$/)
    }));
  });
});

describe('MissingMediaPublisher', () => {
  it('always throws a configuration hint', async () => {
    const publisher = new MissingMediaPublisher();
    await expect(publisher.publish('/tmp/whatever.mp4', 'Bearer test')).rejects.toThrow('COS');
  });
});
