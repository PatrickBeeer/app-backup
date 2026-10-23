import assert from 'node:assert/strict';
import test from 'node:test';
import { getPackagingReferenceAsset, buildDielinePrompt } from './packagingReferenceAssets';

test('maps tuck-end style box names to the tuck-end dieline reference', () => {
  const asset = getPackagingReferenceAsset('插口盒 (Tuck End)');

  assert.match(asset?.url || '', /\/packaging-references\/tuck-end-dieline\.jpg$/);
  assert.match(asset?.promptHint || '', /tuck-end/i);
});

test('maps stand-up pouch to pouch-specific structural prompt', () => {
  const asset = getPackagingReferenceAsset('自立袋 (Stand-up Pouch)');

  assert.match(asset?.url || '', /\/packaging-references\/stand-up-pouch-dieline\.jpeg$/);
  assert.match(asset?.promptHint || '', /bottom gusset/i);
});

test('builds a prompt that tells the model to use the second image as template', () => {
  const prompt = buildDielinePrompt('茶叶包装', '插口盒 (Tuck End)');

  assert.match(prompt, /image 1/i);
  assert.match(prompt, /image 2/i);
  assert.match(prompt, /structural dieline template/i);
});
