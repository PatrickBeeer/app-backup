import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BASE_VIDEO_POINTS_PER_SECOND,
  VIDEO_GENERATION_FLAT_POINTS,
  calculateVideoPointCost,
} from '../shared/pricing';

test('uses Mini 480p as the 3.6 point per-second baseline, adds 10, and rounds upward', () => {
  assert.equal(BASE_VIDEO_POINTS_PER_SECOND, 3.6);
  assert.equal(VIDEO_GENERATION_FLAT_POINTS, 10);
  assert.equal(calculateVideoPointCost('master-video-s2-0-mini', '480p', 4), 25);
});

test('calculates non-baseline tiers from their runtime multiplier', () => {
  assert.equal(calculateVideoPointCost('master-video-s2-0-fast', '720p', 4), 59);
  assert.equal(calculateVideoPointCost('master-video-s2-0', '1080p', 12), 475);
});

test('prices legacy native resolution values without throwing during a bundle transition', () => {
  assert.equal(
    calculateVideoPointCost('master-video-s2-0', 'native1080p', 4),
    calculateVideoPointCost('master-video-s2-0', '1080p', 4),
  );
});

test('rejects an unsupported model and resolution combination', () => {
  assert.throws(
    () => calculateVideoPointCost('master-video-s2-5', '1080p', 4),
    /Unsupported video pricing combination/,
  );
  assert.throws(
    () => calculateVideoPointCost('master-video-s2-0', '4k', 4),
    /Unsupported video pricing combination/,
  );
});
