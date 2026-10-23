export const APP_ID = 'exhibition-design';

// Public COS bucket holding the exhibition case package (folder name keeps the
// original spelling used when the folder was created).
export const COS_PUBLIC_BASE =
  'https://unityshop-public-1342713514.cos.ap-guangzhou.myqcloud.com/apps/exhbition-design';

// Per-category case images under the COS folder (snapshot of bucket listing).
export const CATEGORY_REFERENCE_FILES: Record<string, string[]> = {
  春节: [
    'ScreenShot_2026-09-07_204042_088.png',
    'ScreenShot_2026-09-07_204123_951.png',
    'ScreenShot_2026-09-07_204134_809.png',
    'ScreenShot_2026-09-07_204154_791.png',
    'ScreenShot_2026-09-07_204201_048.png',
    'ScreenShot_2026-09-07_204215_967.png',
    'ScreenShot_2026-09-07_204237_102.png',
    'ScreenShot_2026-09-07_204332_279.png',
    'ScreenShot_2026-09-07_204358_397.png',
    'ScreenShot_2026-09-07_204415_918.png',
    'ScreenShot_2026-09-07_204502_964.png',
    'ScreenShot_2026-09-07_204553_516.png',
  ],
  中秋: [
    'ScreenShot_2026-09-07_202214_910.png',
    'ScreenShot_2026-09-07_202245_022.png',
    'ScreenShot_2026-09-07_202322_717.png',
    'ScreenShot_2026-09-07_202331_437.png',
    'ScreenShot_2026-09-07_202339_550.png',
    'ScreenShot_2026-09-07_202345_109.png',
    'ScreenShot_2026-09-07_202811_345.png',
    'ScreenShot_2026-09-07_202826_298.png',
    'ScreenShot_2026-09-07_202831_817.png',
    'ScreenShot_2026-09-07_202910_121.png',
  ],
  端午: [
    'ScreenShot_2026-09-07_211649_581.png',
    'ScreenShot_2026-09-07_211658_180.png',
    'ScreenShot_2026-09-07_211737_132.png',
    'ScreenShot_2026-09-07_211800_788.png',
    'ScreenShot_2026-09-07_211808_835.png',
    'ScreenShot_2026-09-07_211845_627.png',
    'ScreenShot_2026-09-07_211922_226.png',
    'ScreenShot_2026-09-07_212002_402.png',
    'ScreenShot_2026-09-07_212021_394.png',
    'ScreenShot_2026-09-07_212033_234.png',
  ],
  品牌: [
    'ScreenShot_2026-09-07_212209_016.png',
    'ScreenShot_2026-09-07_212248_816.png',
    'ScreenShot_2026-09-07_212411_671.png',
    'ScreenShot_2026-09-07_212500_678.png',
    'ScreenShot_2026-09-07_212522_214.png',
    'ScreenShot_2026-09-07_212645_701.png',
    'ScreenShot_2026-09-07_212927_819.png',
  ],
  打卡: [
    'ScreenShot_2026-09-07_204659_011.png',
    'ScreenShot_2026-09-07_204729_675.png',
    'ScreenShot_2026-09-07_204737_179.png',
    'ScreenShot_2026-09-07_204752_027.png',
    'ScreenShot_2026-09-07_204820_610.png',
    'ScreenShot_2026-09-07_204827_826.png',
    'ScreenShot_2026-09-07_204851_563.png',
    'ScreenShot_2026-09-07_205027_713.png',
    'ScreenShot_2026-09-07_205039_945.png',
    'ScreenShot_2026-09-07_205119_936.png',
    'ScreenShot_2026-09-07_205129_912.png',
    'ScreenShot_2026-09-07_205143_639.png',
    'ScreenShot_2026-09-07_205526_501.png',
    'ScreenShot_2026-09-07_205549_716.png',
    'ScreenShot_2026-09-07_210901_522.png',
    'ScreenShot_2026-09-07_211019_577.png',
    'ScreenShot_2026-09-07_211150_232.png',
  ],
  校园: [
    'ScreenShot_2026-09-07_205659_659.png',
    'ScreenShot_2026-09-07_205710_259.png',
    'ScreenShot_2026-09-07_205734_955.png',
    'ScreenShot_2026-09-07_205747_243.png',
    'ScreenShot_2026-09-07_205759_515.png',
    'ScreenShot_2026-09-07_205808_122.png',
    'ScreenShot_2026-09-07_205815_026.png',
    'ScreenShot_2026-09-07_205839_123.png',
    'ScreenShot_2026-09-07_205942_697.png',
    'ScreenShot_2026-09-07_210056_600.png',
    'ScreenShot_2026-09-07_210148_097.png',
    'ScreenShot_2026-09-07_210252_072.png',
    'ScreenShot_2026-09-07_210710_859.png',
  ],
};

export function categoryReferenceUrls(category: string): string[] {
  const files = CATEGORY_REFERENCE_FILES[category] || [];
  return files.map(
    (file) =>
      `${COS_PUBLIC_BASE}/${encodeURIComponent(category)}/${encodeURIComponent(file)}`,
  );
}

// Credit costs per billed action (must match app_manager.app_pricing rules).
export const COSTS = {
  main_render: 15,
  flat_conversion: 10,
  element_split: 10,
} as const;
