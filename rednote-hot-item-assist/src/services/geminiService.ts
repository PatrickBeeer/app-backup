/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from "@google/genai";
import {
  extractImageFromResponse,
  extractJsonTextFromResponse,
  extractTextFromResponse,
  generateContent,
  uploadAssetToCOSWithPresignedURL,
} from "../../../../shared_services/geminiProxyService";
import { cacheGeneratedAsset } from "../../../../shared_services/localGeneratedAssetCache";
import { createTaskQueueItem, recordTaskManagerObject } from "../../../../services/taskManagerService";
import { CopySuggestion, ProductAnalysis, VisualStyleSuggestion } from "../types";

const APP_ID = "rednote-hot-item-assist";
const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const RETRYABLE_ERROR_PATTERN = /(\b408\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b524\b|timeout|timed out|etimedout|econnreset|network)/i;

type PersistImageContext = {
  styleName?: string;
  scenePrompt?: string;
  customPrompt?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRetryableError(error: unknown): boolean {
  return RETRYABLE_ERROR_PATTERN.test(normalizeErrorMessage(error));
}

async function executeWithRetry<T>(action: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) {
        console.error(`[rednote-hot-item-assist] ${label} failed after ${attempt} attempt(s).`, error);
        throw error;
      }

      const backoffMs = Math.min(1200 * 2 ** (attempt - 1), 5000);
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

function extractBalancedJsonValue(text: string): string {
  const source = String(text || "");
  if (!source.trim()) {
    return "";
  }

  const objectStart = source.indexOf("{");
  const arrayStart = source.indexOf("[");
  let start = -1;
  if (objectStart >= 0 && arrayStart >= 0) {
    start = Math.min(objectStart, arrayStart);
  } else if (objectStart >= 0) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }

  if (start < 0) {
    return "";
  }

  const opening = source[start];
  const expectedClosing = opening === "{" ? "}" : "]";
  const stack: string[] = [expectedClosing];
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      stack.push("}");
      continue;
    }
    if (ch === "[") {
      stack.push("]");
      continue;
    }
    if ((ch === "}" || ch === "]") && stack.length > 0 && stack[stack.length - 1] === ch) {
      stack.pop();
      if (stack.length === 0) {
        return source.slice(start, i + 1).trim();
      }
    }
  }

  return "";
}

function extractJsonFromLooseText(text: string): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return "";
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]?.trim()) {
    const fenced = fencedMatch[1].trim();
    const balancedFenced = extractBalancedJsonValue(fenced);
    return balancedFenced || fenced;
  }

  const balanced = extractBalancedJsonValue(trimmed);
  if (balanced) {
    return balanced;
  }

  return trimmed;
}

function parseJsonResponse<T>(response: unknown, label: string): T {
  const candidates: string[] = [];

  try {
    const strictText = extractJsonTextFromResponse(response as any).trim();
    if (strictText) {
      candidates.push(strictText, extractJsonFromLooseText(strictText));
    }
  } catch {
    // Fall through to loose text parsing below.
  }

  try {
    const looseText = extractTextFromResponse(response as any);
    if (looseText?.trim()) {
      candidates.push(extractJsonFromLooseText(looseText), looseText.trim());
    }
  } catch {
    // No text candidates.
  }

  const deduped = Array.from(new Set(candidates.filter(Boolean)));
  let lastError: unknown = new Error("empty json candidates");
  for (const candidate of deduped) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`${label} 返回格式异常: ${normalizeErrorMessage(lastError)}`);
}

function extractBestEffortText(response: unknown): string {
  try {
    const strictText = extractJsonTextFromResponse(response as any).trim();
    if (strictText) {
      return strictText;
    }
  } catch {
    // Fall through to loose text parsing.
  }

  try {
    const looseText = extractTextFromResponse(response as any).trim();
    if (looseText) {
      return looseText;
    }
  } catch {
    // No usable text.
  }

  return "";
}

async function parseJsonResponseWithRepair<T>(
  response: unknown,
  label: string,
  responseSchema: Record<string, unknown>
): Promise<T> {
  try {
    return parseJsonResponse<T>(response, label);
  } catch (parseError) {
    const sourceText = extractBestEffortText(response);
    if (!sourceText) {
      throw parseError;
    }

    console.warn(`[rednote-hot-item-assist] ${label} parse failed, attempting JSON repair fallback.`, parseError);

    const repairResponse = await executeWithRetry(
      () =>
        generateContent({
          model: TEXT_MODEL,
          task: "text_gen",
          billing_task: "text_gen",
          contents: {
            parts: [
              {
                text: [
                  "You are a strict JSON formatter.",
                  "Convert the input content into valid JSON that matches the schema.",
                  "Rules:",
                  "1) Output JSON only.",
                  "2) Do not output markdown, explanations, or code fences.",
                  "3) Keep the original language and meaning as much as possible.",
                  "4) If some fields are missing, infer concise, sensible values.",
                  "INPUT:",
                  sourceText,
                ].join("\n"),
              },
            ],
          },
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      `${label} json repair`
    );

    return parseJsonResponse<T>(repairResponse, `${label} 修复`);
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`无法处理生成图片 (HTTP ${response.status})`);
  }
  return response.blob();
}

async function persistGeneratedImageTask(imageDataUrl: string, context: PersistImageContext): Promise<string> {
  const taskName = context.styleName?.trim() ? `小红书场景图 - ${context.styleName.trim()}` : "小红书场景图";
  const blob = await dataUrlToBlob(imageDataUrl);
  const upload = await uploadAssetToCOSWithPresignedURL(blob, {
    fileName: `rednote-hot-item-${Date.now()}.png`,
    objectPath: `standalone/${APP_ID}/generated_images`,
    appID: APP_ID,
    camAppID: APP_ID,
    contentType: blob.type || "image/png",
  });

  const persistedURL =
    String(upload.url || "").trim() ||
    String(upload.signed_url || "").trim() ||
    String(upload.public_url || "").trim() ||
    imageDataUrl;

  let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
  if (String(upload.bucket_name || "").trim() && String(upload.object_key || "").trim()) {
    try {
      objectRecord = await recordTaskManagerObject({
        bucket_name: String(upload.bucket_name || "").trim(),
        region: String(upload.region || "").trim(),
        object_key: String(upload.object_key || "").trim(),
        url: persistedURL,
        size_bytes: blob.size,
        mime_type: blob.type || "image/png",
      });
    } catch (error) {
      console.warn("[rednote-hot-item-assist] object metadata write failed, continue task queue write", error);
    }
  }

  try {
    await createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: "image_link",
      status: "finished",
      payload: {
        title: taskName,
        name: taskName,
        image_url: persistedURL,
        url: persistedURL,
        object_id: objectRecord?.object_id,
        object_key: upload.object_key,
        bucket: upload.bucket_name,
        region: upload.region,
        mime_type: blob.type || "image/png",
        size_bytes: blob.size,
        prompt: context.scenePrompt || "",
        custom_prompt: context.customPrompt || "",
        app_id: APP_ID,
      },
    });
  } catch (error) {
    await createTaskQueueItem({
      source_app_id: APP_ID,
      item_type: "image_link",
      status: "finished",
      payload: {
        title: taskName,
        name: taskName,
        image_url: persistedURL,
        url: persistedURL,
      },
    });
    console.warn("[rednote-hot-item-assist] image task persisted with minimal payload", error);
  }

  return persistedURL;
}

function buildFallbackVisualStyles(analysis: ProductAnalysis): VisualStyleSuggestion[] {
  const productName = asString(analysis.name) || "产品";
  const category = asString(analysis.category) || "商品";
  const visualDetails = asString(analysis.visualDescription) || asString(analysis.description) || productName;

  return [
    {
      id: "scene-1",
      name: "奶油柔光主视觉",
      description: "高质感主图氛围，突出产品第一眼吸引力。",
      scenePrompt: [
        `A Chinese social media lifestyle photo of ${productName} (${category}), soft creamy daylight, premium minimal background,`,
        "female model holding the product naturally, face partially cropped (no full face),", 
        `product must stay identical to reference: ${visualDetails}, no text, no logo overlays, editorial composition, high detail.`,
      ].join(" "),
    },
    {
      id: "scene-2",
      name: "细节动作特写",
      description: "聚焦材质与使用动作，强化真实触感与价值感。",
      scenePrompt: [
        `Macro action shot of ${productName} in use, close-up on hands and product texture, soft directional light,`,
        "shallow depth of field, partial face only (chin or side profile),",
        `strict product consistency with reference: ${visualDetails}, no text, clean aesthetic, xiaohongshu style.`,
      ].join(" "),
    },
    {
      id: "scene-3",
      name: "场景化生活广角",
      description: "在真实生活环境中展示产品，增强代入感与购买欲。",
      scenePrompt: [
        `Wide lifestyle environment featuring ${productName}, coherent color palette, natural interior setting,`,
        "model wearing/holding product while face is not fully visible,",
        `keep exact product appearance from reference (${visualDetails}), no words or numbers, cinematic framing.`,
      ].join(" "),
    },
    {
      id: "scene-4",
      name: "氛围情绪创意镜头",
      description: "用光影与构图制造情绪张力，形成系列感收束。",
      scenePrompt: [
        `Atmospheric creative angle for ${productName}, moody yet elegant lighting, cohesive style with previous scenes,`,
        "dynamic composition, model presence with partial face only,",
        `preserve exact product identity (${visualDetails}), zero text, premium influencer visual language.`,
      ].join(" "),
    },
  ];
}

export async function analyzeProduct(base64Image: string): Promise<ProductAnalysis> {
  const productAnalysisResponseSchema: Record<string, unknown> = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      category: { type: Type.STRING },
      features: { type: Type.ARRAY, items: { type: Type.STRING } },
      sellingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
      description: { type: Type.STRING },
      visualDescription: { type: Type.STRING },
      xiaohongshuTrends: {
        type: Type.OBJECT,
        properties: {
          influencerStyle: { type: Type.STRING },
          sellerStyle: { type: Type.STRING },
        },
        required: ["influencerStyle", "sellerStyle"],
      },
    },
    required: [
      "name",
      "category",
      "features",
      "sellingPoints",
      "description",
      "visualDescription",
      "xiaohongshuTrends",
    ],
  };

  const response = await executeWithRetry(
    () =>
      generateContent({
        model: TEXT_MODEL,
        task: "text_gen",
        billing_task: "text_gen",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Image.split(",")[1],
                mimeType: "image/jpeg",
              },
            },
            {
              text: [
                "Analyze this e-commerce product image. Identify the product name, category, key features, and unique selling points for Xiaohongshu marketing.",
                "Also, provide a highly detailed 'visualDescription' including its exact shape, material, color hex codes (if identifiable), texture, and any unique branding marks.",
                "This visual description will be used to maintain 1:1 consistency in image generation.",
                "",
                "CRITICAL: You must also analyze how this specific product is typically photographed on Xiaohongshu.",
                "Provide 'xiaohongshuTrends' with two string fields (in Chinese):",
                "1. influencerStyle (达人种草图): detail how top lifestyle influencers/KOLs shoot this category.",
                "2. sellerStyle (卖货博主带货图): detail how e-commerce sellers shoot this category.",
              ].join("\n"),
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: productAnalysisResponseSchema,
        },
      }),
    "analyze product"
  );

  let parsed: Partial<ProductAnalysis>;
  try {
    parsed = await parseJsonResponseWithRepair<Partial<ProductAnalysis>>(
      response,
      "产品分析",
      productAnalysisResponseSchema
    );
  } catch (error) {
    console.warn("[rednote-hot-item-assist] 产品分析解析失败，启用兜底分析", error);
    const fallbackText = extractBestEffortText(response);
    const conciseText = fallbackText.replace(/\s+/g, " ").trim().slice(0, 240);
    return {
      name: "未命名产品",
      category: "未分类",
      features: [],
      sellingPoints: [],
      description: conciseText || "基于上传图片自动生成产品分析。",
      visualDescription: conciseText || "保持与原图产品外观一致。",
      xiaohongshuTrends: {
        influencerStyle: "达人种草场景偏向自然生活化构图。",
        sellerStyle: "卖货图风格偏向清晰直给的产品展示。",
      },
    };
  }

  const normalized: ProductAnalysis = {
    name: asString(parsed?.name) || "未命名产品",
    category: asString(parsed?.category) || "未分类",
    features: asStringArray(parsed?.features),
    sellingPoints: asStringArray(parsed?.sellingPoints),
    description: asString(parsed?.description),
    visualDescription: asString(parsed?.visualDescription) || asString(parsed?.description),
    xiaohongshuTrends: {
      influencerStyle: asString((parsed as any)?.xiaohongshuTrends?.influencerStyle),
      sellerStyle: asString((parsed as any)?.xiaohongshuTrends?.sellerStyle),
    },
  };

  if (!normalized.xiaohongshuTrends.influencerStyle && !normalized.xiaohongshuTrends.sellerStyle) {
    delete (normalized as Partial<ProductAnalysis>).xiaohongshuTrends;
  }

  return normalized;
}

export async function generateCopy(
  analysis: ProductAnalysis,
  referenceText?: string,
  coreSellingPoints?: string
): Promise<CopySuggestion[]> {
  const copyResponseSchema: Record<string, unknown> = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        titles: { type: Type.ARRAY, items: { type: Type.STRING } },
        content: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        vibe: { type: Type.STRING, enum: ["cute", "professional", "lifestyle", "minimalist"] },
      },
      required: ["titles", "content", "tags", "vibe"],
    },
  };

  const referencePrompt = referenceText
    ? `
# Reference / Imitation (仿写要求)
用户提供了以下参考文本，请务必仔细分析其**语言风格**、**排版结构**、**情绪基调**，并尽可能模仿该风格来创作本次的 3 个文案选项：
【参考文本开始】
${referenceText}
【参考文本结束】
`
    : "";

  const coreSellingPointsPrompt = coreSellingPoints
    ? `
# Core Selling Points (核心卖点强调)
用户特别强调了以下核心优势、使用场景或痛点解决方案，请务必在文案中着重放大这些点，将其转化为极具情绪感染力的内容：
【核心内容开始】
${coreSellingPoints}
【核心内容结束】
`
    : "";

  const xiaohongshuTrendsPrompt = analysis.xiaohongshuTrends
    ? `
# Xiaohongshu Visual & Scenario Trends (小红书视觉与场景趋势)
系统已识别该品类在小红书的爆款视觉趋势：
- 达人种草视觉/场景：${analysis.xiaohongshuTrends.influencerStyle}
- 卖货博主视觉/场景：${analysis.xiaohongshuTrends.sellerStyle}
【关键指令】请将这些具体拍摄场景和视觉氛围融入文案，让文案与该品类典型爆款图风高度匹配，形成图文合一的种草效果。
`
    : "";

  const response = await executeWithRetry(
    () =>
      generateContent({
        model: TEXT_MODEL,
        task: "text_gen",
        billing_task: "text_gen",
        contents: {
          parts: [
            {
              text: `
# Role
你是一位拥有百万粉丝的小红书资深博主，是内容创作领域的“流量操盘手”。你极度擅长挖掘产品的情绪价值，能将任何枯燥的信息转化为极具感染力、画面感和社交属性的爆款笔记。

# Core Logic (小红书爆款底层逻辑)
1. **极度口语化与网感**：使用小红书高频词句式（如：“谁懂啊家人们”、“尊嘟绝了”、“被路人追着问”、“真香警告”、“狠狠拿捏了”）。语气必须完全是闺蜜间真诚疯狂的安利，绝不能有机器味、说教感或生硬的广告腔调。
2. **情绪价值拉满**：第一句话必须击中痛点、引发强烈共鸣或制造戏剧性反差。例如：“一直以为xx是智商税，直到遇见它...”。
3. **沉浸式场景与通感**：将枯燥的卖点翻译成具体的“爽感”画面。比如不说“吸汗透气”，而说“39度出门狂走一天，后背竟然还是干爽的”；不说“显瘦”，说“穿上立马纸片人，肉肉全隐身”。
4. **人设饱满生动**：设定一个具体的人物标签（如：抠门又挑剔的颜控、每天想多睡10分钟的早八打工人、追求质感的独居女孩），全程用第一人称极其真实的口吻分享。
${referencePrompt}${coreSellingPointsPrompt}${xiaohongshuTrendsPrompt}
# Task Flow
请根据以下输入的产品信息，生成 3 个不同风格（vibe）的小红书文案选项（例如：cute、professional、lifestyle、minimalist中任选3种）：
Product: ${analysis.name}
Features: ${analysis.features.join(", ")}
Selling Points: ${analysis.sellingPoints.join(", ")}

对于每个选项，请提供：
1. **爆款标题 (5个)**
   - 作为 \`titles\` 数组输出。必须包含：[数字/利益点] + [情绪词/反直觉结论] + [人群标签]
   - 示例：谁懂啊！这种[XX感]真的绝绝子！/ 救命！[XX]后悔没早买... / 答应我！[人群]闭眼入不踩雷！
2. **正文写作 (灵活灵动排版，沉浸式互动)**
   - 作为 \`content\` 输出。
   - **结构排版**：极其自然，打破死板的模版感和说明书感！不要生硬罗列卖点1/2/3。把它当作你在微信跟闺蜜狂敲键盘发出去的一连串消息。善用换行、空白留白、以及精准点缀的 Emoji（如 😭✨🔥🍠🛍️👀 等），控制极佳的阅读节奏。多用感叹号、省略号、甚至波浪号来传达充沛的真实情绪！
   - **核心内容**：把产品卖点完全揉碎进一个个具体的生活场景中，用“我”或者“身边人”的真实变化来侧面烘托产品，拉满种草力。
   - **评论区钩子**：在最末添加一句不着痕迹、极其自然的互动提问，就像随口一问（例如：底妆总是卡粉的姐妹举手看看？ / 你们平时出门包里必装的续命神器是啥？）。
3. **标签系统 (SEO)**
   - 作为 \`tags\` 数组输出。自动生成 5-10 个精准的热门标签。
`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: copyResponseSchema,
        },
      }),
    "generate copy"
  );

  const parsed = await parseJsonResponseWithRepair<any[]>(response, "文案生成", copyResponseSchema);
  const normalized = (Array.isArray(parsed) ? parsed : []).map((item) => ({
    titles: asStringArray(item?.titles),
    content: asString(item?.content),
    tags: asStringArray(item?.tags),
    vibe: (["cute", "professional", "lifestyle", "minimalist"] as const).includes(item?.vibe)
      ? item.vibe
      : "lifestyle",
  }));

  const filtered = normalized.filter((item) => item.titles.length > 0 && item.content);
  if (filtered.length === 0) {
    throw new Error("文案生成失败：未返回有效结果");
  }

  return filtered;
}

export async function suggestVisualStyles(analysis: ProductAnalysis): Promise<VisualStyleSuggestion[]> {
  const visualStyleResponseSchema: Record<string, unknown> = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        scenePrompt: { type: Type.STRING },
      },
      required: ["id", "name", "description", "scenePrompt"],
    },
  };

  const response = await executeWithRetry(
    () =>
      generateContent({
        model: TEXT_MODEL,
        task: "text_gen",
        billing_task: "text_gen",
        contents: {
          parts: [
            {
              text: `Based on this product analysis, suggest 4 highly aesthetic Xiaohongshu photography scenes that form a UNIFIED SERIES (consistent vibe, lighting, and color palette).

    Product: ${analysis.name}
    Category: ${analysis.category}
    Visual Details: ${analysis.visualDescription}

    CRITICAL REQUIREMENTS:
    1. AESTHETIC: MUST strongly exhibit Xiaohongshu viral influencer aesthetic, with curated lifestyle photography, soft film-like or creamy lighting, and modern composition.
    2. SERIES FEEL: All 4 scenes must share a similar color story or theme.
    3. LANGUAGE: The name and description fields MUST be in CHINESE.
    4. CATEGORY-SPECIFIC TROPES:
      - Skincare/Body: glowing-skin closeups, vanity mood, texture swatches.
      - Bags/Accessories: cafe OOTD, mirror shots, hand-carry closeups.
      - Clothing: street atmosphere, mirror OOTD, fabric detail closeups.
      - Shoes: top-down POV and casual seated styling.
      - Food/Drinks: appetizing closeups, picnic/tea setup, handheld daily snapshots.
      - Home/Decor: cozy room/desk/window light, lazy lifestyle scenes.
      - Makeup/Lips: lip texture closeups, hand swatches, partial-face composition.
    5. DYNAMIC TREND INPUT:
      - Influencer insight: ${analysis.xiaohongshuTrends?.influencerStyle || "N/A"}
      - Seller insight: ${analysis.xiaohongshuTrends?.sellerStyle || "N/A"}
      IMPORTANT: apply these insights to tailor all scenes to this exact product.
    6. MODELS: every scene must include a model holding/wearing the product.
    7. PARTIAL FACE: full face must not be visible; use cropped/angled compositions.
    8. NO TEXT: output image must contain no text, letters, numbers, or watermarks.
    9. IMAGE PROMPT: scenePrompt must be in ENGLISH and include high-aesthetic Xiaohongshu keywords.

    Scenes should be:
    - Scene 1: Main Series Theme (High-end/Lifestyle)
    - Scene 2: Detail Focus (Macro/Action)
    - Scene 3: Environment Context (Wider shot)
    - Scene 4: Emotional/Atmospheric (Creative angle)

    For each, provide scenePrompt that keeps the product identity consistent while changing environment and shot language.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: visualStyleResponseSchema,
        },
      }),
    "suggest visual styles"
  );

  let parsed: any[] = [];
  try {
    parsed = await parseJsonResponseWithRepair<any[]>(response, "场景建议", visualStyleResponseSchema);
  } catch (error) {
    console.warn("[rednote-hot-item-assist] 场景建议解析失败，启用模板兜底方案", error);
    return buildFallbackVisualStyles(analysis);
  }

  const normalized = (Array.isArray(parsed) ? parsed : []).map((item, index) => ({
    id: asString(item?.id) || `scene-${index + 1}`,
    name: asString(item?.name) || `方案 ${index + 1}`,
    description: asString(item?.description),
    scenePrompt: asString(item?.scenePrompt),
  }));

  const filtered = normalized.filter((item) => item.scenePrompt);
  if (filtered.length === 0) {
    throw new Error("场景建议生成失败：未返回有效结果");
  }

  return filtered;
}

export async function generateStyledImage(
  prompt: string,
  referenceImage?: string,
  customPrompt?: string,
  context: PersistImageContext = {}
): Promise<string> {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const consistencyInstruction = [
    "MANDATORY: PIXEL-PERFECT PRODUCT CONSISTENCY.",
    "You MUST identically reproduce the product from the reference image.",
    "Maintain EXACT color hex codes, material textures, and silhouette/shape.",
    "Do NOT modify the product's physical identity.",
    "The background and environment can change, but the product itself must be a 1:1 match.",
    "AESTHETIC MANDATE: final image must strongly match Xiaohongshu viral influencer style.",
    "Use curated lifestyle composition, natural/creamy light, and realistic Chinese social-media photo feeling.",
    "If model appears, keep full face hidden and use partial-face angles.",
    "The resulting image must NOT contain any text, watermarks, letters, or numbers.",
  ].join(" ");

  const finalPrompt = `${consistencyInstruction} Base Scene: ${prompt}. ${customPrompt ? `User Adjustment: ${customPrompt}.` : ""}`;
  const parts: Array<Record<string, unknown>> = [{ text: finalPrompt }];

  if (referenceImage) {
    parts.push({
      inlineData: {
        data: referenceImage.split(",")[1],
        mimeType: "image/jpeg",
      },
    });
  }

  const response = await executeWithRetry(
    () =>
      generateContent({
        model: IMAGE_MODEL,
        task: "image_gen",
        billing_task: "image_gen",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "3:4",
          },
          seed,
        },
      }),
    "generate styled image"
  );

  const generatedImageDataUrl = extractImageFromResponse(response);
  if (!generatedImageDataUrl) {
    throw new Error("No image generated");
  }

  cacheGeneratedAsset({
    appId: APP_ID,
    source: generatedImageDataUrl,
    provider: IMAGE_MODEL,
    title: context.styleName,
  });

  try {
    return await persistGeneratedImageTask(generatedImageDataUrl, {
      ...context,
      scenePrompt: prompt,
      customPrompt,
    });
  } catch (error) {
    console.warn("[rednote-hot-item-assist] image queue persistence failed, returning local image", error);
    return generatedImageDataUrl;
  }
}
