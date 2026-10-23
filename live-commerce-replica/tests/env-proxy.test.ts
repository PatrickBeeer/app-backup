import * as http from 'node:http';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { enableEnvProxy } from '../src/network/env-proxy.js';

const originalProxyEnv = {
  HTTP_PROXY: process.env.HTTP_PROXY,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  NO_PROXY: process.env.NO_PROXY
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalProxyEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const hasSetGlobalProxyFromEnv = typeof (http as typeof http & { setGlobalProxyFromEnv?: unknown }).setGlobalProxyFromEnv === 'function';

describe('enableEnvProxy', () => {
  it('returns a restore function without throwing when the API is available or unavailable', () => {
    const restore = enableEnvProxy();
    expect(typeof restore).toBe('function');
    restore();
  });

  it.runIf(hasSetGlobalProxyFromEnv)('routes global fetch through the HTTP proxy from the environment', async () => {
    let requestedUrl = '';
    const proxy = createServer();
    proxy.on('connect', (request, socket) => {
      requestedUrl = request.url ?? '';
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('测试代理没有监听端口');

    process.env.HTTP_PROXY = `http://127.0.0.1:${address.port}`;
    process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    process.env.NO_PROXY = '';
    const restore = enableEnvProxy();
    try {
      await expect(fetch('https://jingke-proxy-test.invalid/model/config.json')).rejects.toThrow();

      expect(requestedUrl).toBe('jingke-proxy-test.invalid:443');
    } finally {
      restore();
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });
});
