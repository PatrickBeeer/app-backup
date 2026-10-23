/**
 * 棒球帽工作台 - 常量配置
 */

// 默认设计迭代强度
export const DEFAULT_INTENSITY = 30;

// 迭代强度范围
export const INTENSITY_MIN = 10;
export const INTENSITY_MAX = 60;

// 迭代强度标签
export const getIntensityLabel = (val: number): string => {
  if (val <= 20) return "保守迭代 (细节微调)";
  if (val <= 40) return "标准迭代 (材质与色彩重组)";
  return "激进迭代 (结构性创意更新)";
};
