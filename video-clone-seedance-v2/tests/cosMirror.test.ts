import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  clearCosMirrorCacheForTests,
  mirrorLocalFileToCOS,
} from '../server/cosMirror';

test('mirrorLocalFileToCOS presigns then PUTs the bytes and returns the COS download url', async () => {
  clearCosMirrorCacheForTests();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cos-mirror-'));
  const localPath = path.join(dir, 'sample.png');
  await fs.writeFile(localPath, Buffer.from('fake-png-bytes'));

  const originalFetch = globalThis.fetch;
  let presignCalls = 0;
  let putCalls = 0;
  let putBody = '';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (url.includes('/api/v1/execute/cos/presign-upload')) {
      presignCalls += 1;
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({
        code: 0,
        data: {
          upload_url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/signed-put?x=1',
          url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/user_storage/1/cprt_refs/sample.png?q-sign=abc',
          public_url: 'https://bucket.cos.ap-guangzhou.myqcloud.com/user_storage/1/cprt_refs/sample.png',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('signed-put')) {
      putCalls += 1;
      assert.equal(init?.method, 'PUT');
      // body 是 Uint8Array（node fetch 会把 Buffer 转成字节数组）。
      putBody = Array.from(init?.body || []).map((b: number) => String.fromCharCode(b)).join('');
      return new Response('', { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as any;

  try {
    const mirrored = await mirrorLocalFileToCOS(localPath, 'sample.png', 'image/png');
    assert.equal(presignCalls, 1);
    assert.equal(putCalls, 1);
    assert.equal(putBody, 'fake-png-bytes');
    assert.match(String(mirrored), /q-sign=abc$/);

    // 第二次镜像同一文件走缓存，不再发起任何请求。
    const again = await mirrorLocalFileToCOS(localPath, 'sample.png', 'image/png');
    assert.equal(presignCalls, 1);
    assert.equal(again, mirrored);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('mirrorLocalFileToCOS returns null (fallback) when the presign endpoint is unreachable', async () => {
  clearCosMirrorCacheForTests();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cos-mirror-'));
  const localPath = path.join(dir, 'sample.mp4');
  await fs.writeFile(localPath, Buffer.from('fake-mp4-bytes'));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('unavailable', { status: 503 })) as any;
  try {
    const mirrored = await mirrorLocalFileToCOS(localPath, 'sample.mp4', 'video/mp4');
    assert.equal(mirrored, null);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('mirrorLocalFileToCOS corrects JPEG bytes named .png before presigning and uploading', async () => {
  clearCosMirrorCacheForTests();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cos-mirror-jpeg-'));
  const localPath = path.join(dir, 'old.png');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2]);
  await fs.writeFile(localPath, jpeg);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).includes('presign-upload')) {
      assert.equal(JSON.parse(String(init?.body)).file_name, 'old.jpg');
      assert.equal(JSON.parse(String(init?.body)).content_type, 'image/jpeg');
      return new Response(JSON.stringify({ data: {
        upload_url: 'https://example.com/signed-put',
        url: 'https://example.com/old.jpg',
        headers: { 'Content-Type': 'image/jpeg' },
      } }), { status: 200 });
    }
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(init?.body), jpeg);
    return new Response('', { status: 200 });
  }) as any;
  try {
    assert.equal(await mirrorLocalFileToCOS(localPath, 'old.png', 'image/png'), 'https://example.com/old.jpg');
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
