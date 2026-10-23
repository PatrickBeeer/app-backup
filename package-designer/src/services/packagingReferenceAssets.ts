export interface PackagingReferenceAsset {
  url: string;
  label: string;
  promptHint: string;
}

function resolveReferenceAssetUrl(fileName: string): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return `${baseUrl.replace(/\/+$/, '')}/packaging-references/${fileName}`;
}

const REFERENCE_ASSETS: Record<string, PackagingReferenceAsset> = {
  tuckEnd: {
    url: resolveReferenceAssetUrl('tuck-end-dieline.jpg'),
    label: '插舌/插口盒展开图规范',
    promptHint: 'tuck-end paper box with front, back, side panels, glue flap, dust flaps, top and bottom tuck tabs, solid cut lines and dashed fold lines',
  },
  lidBase: {
    url: resolveReferenceAssetUrl('lid-base-dieline.webp'),
    label: '天地盖展开图规范',
    promptHint: 'lid-and-base rigid box with separate lid dieline and base dieline, side wall foldovers, long-width-height dimension marks',
  },
  mailer: {
    url: resolveReferenceAssetUrl('mailer-box-dieline.jpg'),
    label: '飞机盒展开图规范',
    promptHint: 'mailer box dieline with connected folding panels, locking tabs, side wings, dust flaps, rounded outer contour, solid cut lines and dashed fold lines',
  },
  sleeve: {
    url: resolveReferenceAssetUrl('sleeve-box-dieline.webp'),
    label: '抽拉盒展开图规范',
    promptHint: 'sleeve drawer box with cover sleeve dieline and inner tray dieline, side walls, glue tabs, fold lines and two-part structure',
  },
  book: {
    url: resolveReferenceAssetUrl('book-style-dieline.webp'),
    label: '书型盒展开图规范',
    promptHint: 'book-style rigid box dieline with cover board, spine, inner tray, hinge structure and separated foldable panels',
  },
  standUpPouch: {
    url: resolveReferenceAssetUrl('stand-up-pouch-dieline.jpeg'),
    label: '自立袋展开图规范',
    promptHint: 'stand-up pouch flat layout with front and back pouch panels, zipper/self-seal area, bottom gusset panel, bottom expansion width and heat seal margins',
  },
  flatPouch: {
    url: resolveReferenceAssetUrl('flat-pouch-dieline.jpg'),
    label: '三边封袋展开图规范',
    promptHint: 'three-side sealed flat pouch dieline with front and back panels, rounded corners, top tear notch, heat seal margins, dashed seal lines and dimension marks',
  },
  carrierBag: {
    url: resolveReferenceAssetUrl('carrier-bag-dieline.png'),
    label: '手提袋展开图规范',
    promptHint: 'carrier bag dieline with front and back panels, side gusset fold lines, bottom folding flaps, handle holes and cut/fold color-coded lines',
  },
  tube: {
    url: resolveReferenceAssetUrl('tube-dieline.jpg'),
    label: '圆筒包装展开图规范',
    promptHint: 'cylindrical tube packaging dieline with rectangular wraparound label area and circular top/bottom cap structure',
  },
  special: {
    url: resolveReferenceAssetUrl('special-shape-dieline.png'),
    label: '异形盒展开图规范',
    promptHint: 'special-shape gift box dieline that preserves the unusual contour, custom tabs, fold lines and locking structure from the template',
  },
};

const BOX_TYPE_TO_KEY: Array<[RegExp, keyof typeof REFERENCE_ASSETS]> = [
  [/插口盒|插舌盒|tuck/i, 'tuckEnd'],
  [/天地盖|lid|base/i, 'lidBase'],
  [/飞机盒|mailer/i, 'mailer'],
  [/抽屉盒|抽拉盒|sleeve/i, 'sleeve'],
  [/书型盒|book/i, 'book'],
  [/自立袋|stand-up/i, 'standUpPouch'],
  [/三边封|flat pouch|背封袋|八边封/i, 'flatPouch'],
  [/手提袋|carrier/i, 'carrierBag'],
  [/圆筒|tube/i, 'tube'],
  [/异形|special/i, 'special'],
];

export function getPackagingReferenceAsset(boxType: string): PackagingReferenceAsset | null {
  const match = BOX_TYPE_TO_KEY.find(([pattern]) => pattern.test(boxType));
  return match ? REFERENCE_ASSETS[match[1]] : null;
}

export function buildDielinePrompt(description: string, boxType: string): string {
  const asset = getPackagingReferenceAsset(boxType);
  const structureHint = asset?.promptHint || 'professional packaging dieline with accurate panels, tabs, glue flaps, solid cut lines and dashed fold lines';

  return [
    `Use image 1 as the finished 3D packaging mockup and image 2 as the structural dieline template.`,
    `Generate a clean 2D unfolded packaging dieline for: ${description}.`,
    `Box or bag type: ${boxType}.`,
    `Follow this structure exactly: ${structureHint}.`,
    `Transfer the visual design from image 1 onto the corresponding front, back, side, top and bottom panels of image 2.`,
    `Keep the structural layout from image 2: panel proportions, glue flap, dust flaps, tuck tabs, gussets, handle holes, cut lines, fold lines and labels where applicable.`,
    `Use a clean white background, crisp black solid cut lines, dashed fold lines, and professional packaging engineering presentation.`,
    `Do not create a perspective mockup, poster, or decorative flat lay. The result must be a production-style unfolded dieline.`,
  ].join('\n');
}
