import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { config } from '../server/config';
import { findLocalAsset, saveLocalAsset } from '../server/localAssets';

test('new images use the extension and MIME detected from actual bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-assets-mime-'));
  const oldDir = config.assetStorageDir;
  config.assetStorageDir = dir;
  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
    const asset = saveLocalAsset('portrait.png', 'image/png', jpeg);
    assert.equal(asset.fileName, 'portrait.jpg');
    assert.equal(asset.contentType, 'image/jpeg');
    assert.equal(findLocalAsset(path.basename(asset.filePath))?.contentType, 'image/jpeg');
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const pngAsset = saveLocalAsset('portrait.jpg', 'image/jpeg', png);
    assert.equal(pngAsset.fileName, 'portrait.png');
    assert.equal(pngAsset.contentType, 'image/png');
  } finally {
    config.assetStorageDir = oldDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('old .png assets containing JPEG bytes are served as JPEG', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-assets-old-'));
  const oldDir = config.assetStorageDir;
  config.assetStorageDir = dir;
  try {
    const assetFileName = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-portrait.png';
    await fs.writeFile(path.join(dir, assetFileName), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    assert.equal(findLocalAsset(assetFileName)?.contentType, 'image/jpeg');
  } finally {
    config.assetStorageDir = oldDir;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
