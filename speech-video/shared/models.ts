export const MODEL_TIERS = [
  { id: 'master-video-s2-0-mini', name: '2.0 mini', label: '低', multiplier: 1 },
  { id: 'master-video-s2-0-fast', name: '2.0 fast', label: '中', multiplier: 1.57 },
  { id: 'master-video-s2-0', name: '2.0', label: '高', multiplier: 2 },
] as const;

export type ModelId = (typeof MODEL_TIERS)[number]['id'];
export const DEFAULT_MODEL: ModelId = MODEL_TIERS[0].id;

export function parseModel(value: unknown): ModelId {
  if (value == null) return DEFAULT_MODEL;
  const tier = MODEL_TIERS.find((item) => item.id === value);
  if (!tier) throw new Error('请选择有效的生成模型档位。');
  return tier.id;
}

export function videoPointCost(model: ModelId, seconds: number): number {
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 15) {
    throw new RangeError('视频时长须为4至15秒。');
  }
  const tier = MODEL_TIERS.find((item) => item.id === model);
  if (!tier) throw new Error('请选择有效的生成模型档位。');
  return Math.ceil(3.6 * tier.multiplier * seconds + 10);
}
