import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt } from './openaiImageService';

test('builds a packaging mockup prompt for standard generation', () => {
  const prompt = buildPrompt('Make a tea box', 'standard');

  assert.match(prompt, /packaging design mockup/i);
  assert.match(prompt, /make a tea box/i);
});

test('builds an industry-leader prompt for premium references', () => {
  const prompt = buildPrompt('luxury tea box', 'industry');

  assert.match(prompt, /industry leaders/i);
  assert.match(prompt, /premium aesthetics/i);
});

test('builds an edit prompt that preserves image ordering semantics', () => {
  const prompt = buildPrompt('add embossed gold foil', 'edit');

  assert.match(prompt, /image 1/i);
  assert.match(prompt, /structural references/i);
  assert.match(prompt, /add embossed gold foil/i);
});
