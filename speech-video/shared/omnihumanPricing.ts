export function videoPricingConfigured(pointsPerSecond: number): boolean {
  return Number.isSafeInteger(pointsPerSecond) && pointsPerSecond > 0 && pointsPerSecond <= 10000;
}

export function videoPointCost(seconds: number, pointsPerSecond: number): number {
  if (!videoPricingConfigured(pointsPerSecond)) {
    throw new Error('数字人视频积分价格尚未配置，暂不能提交视频任务。');
  }
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 15) {
    throw new Error('视频时长须为4至15秒。');
  }
  return seconds * pointsPerSecond;
}
