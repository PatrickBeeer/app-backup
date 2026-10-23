// video-clone-v3 shared pricing：按 model + resolution + duration 计算视频生成积分。
// 与 video-clone-seedance-v2/shared/pricing.ts 同构，但适配 v3 的 provider：
// TokenDance seedance-2.0-fast（720p）、Kling kling-v1-6（multi-elements 720p/1080p）、
// Kling kling-3.0（image-to-video 720p/1080p）。
//
// app-manager 的 standaloneExecuteBilledRun 会先把 action 改成 quote_clone_job
// 调本 BFF 取 pointCost，再用 pointCost 覆盖 pricing_rules 里 video_gen 的固定
// 25 credits 后扣费；因此本函数必须返回整数（app-manager 校验 float64 是否等于 int64）。

export const BASE_VIDEO_POINTS_PER_SECOND = 3.6;
export const VIDEO_GENERATION_FLAT_POINTS = 10;

export const VIDEO_PRICE_MULTIPLIERS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // TokenDance seedance2 引擎：上游固定 720p（见 server/tokendance.ts）。
  // 与 v2 'free-video-2.0-fast-multimodal-video' 720p 档位对齐。
  'seedance-2.0-fast': {
    '720p': 3.4,
    '1080p': 6.8,
  },
  // Kling multi-elements 替换（referenceVideo 存在时走 kling-v1-6）。
  // 720p=std 模式，1080p=pro 模式；multi-elements 是高端编辑任务，单价高于 i2v。
  'kling-v1-6': {
    '720p': 3.0,
    '1080p': 6.0,
  },
  // Kling image-to-video（无 referenceVideo 时走 kling-3.0 端点）。
  'kling-3.0': {
    '720p': 2.5,
    '1080p': 5.0,
  },
  // CPRT master-video-s2-*（Ark 网关，从 video-clone-seedance-v2/shared/pricing.ts 对齐）。
  'master-video-s2-0-mini': {
    '480p': 1,
    '720p': 2.14,
  },
  'master-video-s2-0-fast': {
    '480p': 1.57,
    '720p': 3.4,
  },
  'master-video-s2-0': {
    '480p': 2,
    '720p': 4.32,
    '1080p': 10.75,
  },
  'master-video-s2-5': {
    '480p': 2.89,
    '720p': 6.46,
  },
};

export function normalizeVideoResolution(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'native1080p') return '1080p';
  if (normalized === 'native4k') return '4k';
  return normalized;
}

export function calculateVideoPointCost(model: string, resolution: string, durationSeconds: number): number {
  const multiplier = VIDEO_PRICE_MULTIPLIERS[String(model || '').trim()]?.[normalizeVideoResolution(resolution)];
  if (!Number.isFinite(multiplier) || Number(multiplier) <= 0) {
    throw new RangeError(`Unsupported video pricing combination: ${model} / ${resolution}`);
  }

  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError('Video duration must be greater than zero.');
  }

  return Math.ceil(
    BASE_VIDEO_POINTS_PER_SECOND * Number(multiplier) * seconds
      + VIDEO_GENERATION_FLAT_POINTS,
  );
}
