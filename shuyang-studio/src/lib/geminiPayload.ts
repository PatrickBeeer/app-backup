import type { ReferenceImage } from '../types';

type Part = Record<string, unknown>;

export function buildGenerationPlan(count: number): number[] {
  if (![1, 2, 4, 5].includes(count)) throw new Error('invalid-generation-count');
  return Array.from({ length: count }, (_, index) => index);
}

// 归一化产品参考图：兼容旧的单图 productReference 与新的多图 productReferences 数组。
// 多张产品图视为「同一件产品的不同角度与细节视图」，在同一个参考标签下依次挂载。
function normalizeProductReferences(opts: {
  productReferences?: ReferenceImage[] | null;
  productReference?: ReferenceImage | null;
}): ReferenceImage[] {
  const { productReferences, productReference } = opts;
  const list = Array.isArray(productReferences)
    ? productReferences
    : productReference
      ? [productReference]
      : [];
  return list.filter((ref) => Boolean(ref?.mimeType) && typeof ref?.data === 'string' && ref.data);
}

function buildProductGroupNote(count: number): string {
  return count > 1 ? `（共 ${count} 张，均为同一件产品的不同角度与细节视图，须综合一致地理解）` : '';
}

function inlineDataPart(ref: ReferenceImage): Part {
  return { inlineData: { mimeType: ref.mimeType, data: ref.data } };
}

/**
 * 构造图片生成请求的 parts：保持原 gemini-request-builder 的参考图标签与顺序
 * （文本提示 → 参考图1 身份 → 参考图2 内裤视觉(可选) → 产品图组 → 参考图4 一致性锚点）。
 */
export function buildImageParts(opts: {
  prompt: string;
  productReferences: ReferenceImage[];
  identityReference?: ReferenceImage | null;
  visualReference?: ReferenceImage | null;
  consistencyReference?: ReferenceImage | null;
}): Part[] {
  const { prompt, productReferences, identityReference = null, visualReference = null, consistencyReference = null } = opts;
  const products = normalizeProductReferences({ productReferences });
  if (!prompt || !products.length) throw new Error('invalid-gemini-payload-input');

  // 主图批次一致性锚定图：附在所有参考图之后，仅用于锁定产品颜色/版型/材质/细节。
  const anchorParts: Part[] =
    consistencyReference?.mimeType && consistencyReference?.data
      ? [
          {
            text: '参考图4：本批次第 1 张已生成的主图，仅作为产品一致性锚定。只继承其中产品的真实颜色、色值深浅、面料纹理、版型轮廓、裁片拼接、包边宽度、腰线高度、腿口曲线与缝线细节；严禁复制该图中的人物姿势、动作、景别、构图、光线布局、背景或版式。',
          },
          inlineDataPart(consistencyReference),
        ]
      : [];

  const productNote = buildProductGroupNote(products.length);
  const productInlineParts = products.map(inlineDataPart);

  const referenceParts: Part[] = identityReference
    ? [
        {
          text: '参考图1：舒氧固定模特身份参考。仅用于锁定同一张脸、五官比例、下颌线、眉毛、眼部妆容、发型与整体面部气质；不得复制其中的服装、背景、配饰或姿势。参考图1中的眼妆（上眼皮上一道夸张的纯白色宽幅彩绘、眼尾略外扬，睫毛保持自然本色）属于固定模特身份标识的一部分，生成时必须原样沿用；注意白色只画在眼皮上，参考图1中的睫毛并非白色。',
        },
        inlineDataPart(identityReference),
        ...(visualReference
          ? [
              {
                text: '参考图2：舒氧内裤模特视觉参考。只参考自然圆润上提的臀型、腰臀曲线、局部商业摄影景别和明亮柔和布光；不得复制图中文字、Logo、具体内裤、颜色、版型、材质、手势或排版。',
              },
              inlineDataPart(visualReference),
            ]
          : []),
        {
          text: `${visualReference ? '参考图3' : '参考图2'}：用户上传的产品参考图${productNote}。这些图共同决定服装或贴身产品的类别、颜色、版型、整体轮廓、长度、领型、袖型、罩杯、肩带、腰头、下摆、花型、裁片、拼接、面料纹理与缝线；须综合全部图片一致理解同一件产品，颜色以多张图中一致的主导呈现为准，不得只取其中一张而忽略其他可见结构。`,
        },
        ...productInlineParts,
        ...anchorParts,
      ]
    : [
        {
          text: `用户上传的产品参考图${productNote}。这些图共同决定产品设计、颜色、结构与材质；须综合全部图片一致理解，颜色以多张图中一致的主导呈现为准。`,
        },
        ...productInlineParts,
      ];

  return [{ text: prompt }, ...referenceParts];
}

/** 构造纯文本 / 视觉分析（主图规划、卖点分析）请求的 parts。 */
export function buildTextAnalysisParts(opts: {
  prompt: string;
  productReferences: ReferenceImage[];
}): Part[] {
  const { prompt, productReferences } = opts;
  const products = normalizeProductReferences({ productReferences });
  if (!prompt || !products.length) throw new Error('invalid-text-analysis-input');
  const productNote = buildProductGroupNote(products.length);
  return [
    { text: prompt },
    {
      text: `用户上传的产品参考图${productNote}：只分析这些图中确实可见的品类、轮廓、结构、面料和工艺；多张图须综合为同一件产品理解，颜色以多张一致的主导呈现为准。`,
    },
    ...products.map(inlineDataPart),
  ];
}
