import { generateContent, extractImageFromResponse, extractJsonTextFromResponse } from '../../../shared_services/geminiProxyService';
import type { AspectRatio, ImageSize, ImageFile, MarketingCopy } from '../types';

const textModel = 'gemini-3-flash-preview';
const imageModel = 'gemini-3.1-flash-image-preview';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1200;

const RETRYABLE_ERROR_PATTERNS = [
    '502',
    '503',
    '504',
    '524',
    'bad gateway',
    'gateway timeout',
    'timeout',
    'timed out',
    'unavailable',
    'llm upstream request failed',
];

type ImageGenerationStrategy = {
    name: string;
    maxReferenceImages: number;
    promptText: string;
};

type ImageScene = 'atmosphere' | 'standard';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGenerationError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
    if (!message) {
        return false;
    }

    return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function withTransientRetry<T>(
    task: () => Promise<T>,
    label: string,
    maxAttempts = MAX_RETRY_ATTEMPTS,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await task();
        } catch (error) {
            lastError = error;
            const canRetry = attempt < maxAttempts && isTransientGenerationError(error);
            if (!canRetry) {
                throw error;
            }

            const delayMs = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
            console.warn(`[s_skincare-product-image] transient ${label} failure, retrying`, {
                attempt,
                maxAttempts,
                delayMs,
                error,
            });
            await sleep(delayMs);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

function buildImageStrategies(prompt: string, scene: ImageScene = 'standard'): ImageGenerationStrategy[] {
    const normalizedPrompt = prompt.trim();
    const compactPrompt = normalizedPrompt.replace(/\s+/g, ' ').slice(0, 240);
    const atmosphereConstraint = scene === 'atmosphere'
        ? '图1全案氛围：与其余主图保持统一的产品居中、完整露出、柔和棚拍和干净留白风格。根据参考产品的实际色彩选择协调的低饱和非白色背景，可用简洁渐变或平面色块；避免白底、复杂道具、强烈反光和夸张光束。'
        : '';
    const strictPrompt = `${normalizedPrompt}
${atmosphereConstraint}
商业规范：
- 严禁修改产品外观、颜色、包装细节。
- 生成结果必须与参考图中的产品完全一致。
- 如涉及模特，场景必须极其简洁，采用影棚布光，背景干净，色调与产品协调。
- 画面禁止出现杂乱背景、无关元素、文字、水印或 logo。
- 极高清晰度，商业摄影级别。`;
    const fallbackPrompt = `${compactPrompt}
${atmosphereConstraint}
要求：产品外观与参考图完全一致，背景简洁干净，商业摄影风格，无文字水印。`;
    const minimalPrompt = `${compactPrompt || '护肤产品主图'}。${atmosphereConstraint}保持产品一致，干净背景，商业摄影，无文字水印。`;

    return [
        { name: 'full_prompt_full_refs', maxReferenceImages: 3, promptText: strictPrompt },
        { name: 'compact_prompt_two_refs', maxReferenceImages: 2, promptText: fallbackPrompt },
        { name: 'minimal_prompt_single_ref', maxReferenceImages: 1, promptText: minimalPrompt },
    ];
}

async function generateImageByStrategy(
    strategy: ImageGenerationStrategy,
    images: ImageFile[],
    aspectRatio: AspectRatio,
    imageSize: ImageSize,
): Promise<string> {
    const imageParts = images.slice(0, strategy.maxReferenceImages).map((img) => ({
        inlineData: {
            mimeType: img.type,
            data: img.base64,
        },
    }));

    return withTransientRetry(async () => {
        const response = await generateContent({
            model: imageModel,
            task: 'image_gen',
            billing_task: 'image_gen',
            contents: {
                parts: [
                    ...imageParts,
                    { text: strategy.promptText },
                ],
            },
            config: {
                imageConfig: {
                    aspectRatio,
                    imageSize,
                },
            },
        });

        const imageUrl = extractImageFromResponse(response);
        if (!imageUrl) {
            throw new Error('render returned empty image payload');
        }

        return imageUrl;
    }, `image generation (${strategy.name})`);
}

export interface ProductAnalysis {
  keywords: string[];
  prompts: string[];
  copies: MarketingCopy[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getField(record: Record<string, unknown>, names: string[]): unknown {
    const normalizedNames = names.map(name => name.toLowerCase().replace(/[\s_-]/g, ''));
    const entry = Object.entries(record).find(([key]) =>
        normalizedNames.includes(key.toLowerCase().replace(/[\s_-]/g, '')));
    return entry?.[1];
}

function findAnalysis(value: unknown, depth = 0): Record<string, unknown> | null {
    if (depth > 5) return null;
    if (typeof value === 'string') {
        try { return findAnalysis(JSON.parse(value), depth + 1); } catch { return null; }
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findAnalysis(item, depth + 1);
            if (found) return found;
        }
    }
    if (isRecord(value)) {
        if (getField(value, ['prompts', 'photographyTips', 'visualPrompts', 'imagePrompts', '摄影提示词', '拍摄提示词', '摄影方案'])
            && getField(value, ['copies', 'marketingCopy', 'marketingCopies', 'copy', '营销文案', '爆款营销文案', '文案'])) {
            return value;
        }
        for (const item of Object.values(value)) {
            const found = findAnalysis(item, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

function normalizeProductAnalysis(value: unknown): ProductAnalysis {
    const record = findAnalysis(value);
    if (!record) throw new Error('规划结果缺少摄影方案或营销文案');

    const rawPrompts = getField(record, ['prompts', 'photographyTips', 'visualPrompts', 'imagePrompts', '摄影提示词', '拍摄提示词', '摄影方案']);
    const rawCopies = getField(record, ['copies', 'marketingCopy', 'marketingCopies', 'copy', '营销文案', '爆款营销文案', '文案']);
    const rawKeywords = getField(record, ['keywords', 'sellingPoints', 'features', '卖点', '核心卖点', '关键词']);

    const prompts = Array.isArray(rawPrompts) ? rawPrompts.map(item => {
        const text = isRecord(item) ? getField(item, ['prompt', 'text', '提示词']) : item;
        return typeof text === 'string' ? text.trim() : '';
    }) : [];
    const copies = Array.isArray(rawCopies) ? rawCopies.map(item => {
        if (!isRecord(item)) return { mainTitle: '', subTitle: '' };
        const mainTitle = getField(item, ['mainTitle', 'title', '主标题', '标题']);
        const subTitle = getField(item, ['subTitle', 'subtitle', 'description', '副标题', '描述']);
        return {
            mainTitle: typeof mainTitle === 'string' ? mainTitle.trim() : '',
            subTitle: typeof subTitle === 'string' ? subTitle.trim() : '',
        };
    }) : [];
    const keywords = Array.isArray(rawKeywords)
        ? rawKeywords.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
        : typeof rawKeywords === 'string' ? rawKeywords.split(/[,，、\n]+/).map(item => item.trim()).filter(Boolean) : [];

    if (prompts.length !== 5 || prompts.some(item => !item)
        || copies.length !== 5 || copies.some(item => !item.mainTitle || !item.subTitle)
        || keywords.length === 0) {
        throw new Error('规划结果不完整，请重新尝试');
    }
    return { keywords, prompts, copies };
}

export async function analyzeProductImages(images: ImageFile[]): Promise<ProductAnalysis> {
    const prompt = `你是一位中国顶级电商运营官和视觉总监。请深度观察洗面奶产品的外观特征（颜色、材质、品牌调性）。
    
    请完成两项任务：
    1. 为 5 张主图规划【中文摄影提示词】。
    2. 为 5 张主图分别撰写【爆款营销文案】（包含一个 4-6 字主标题，一个 8-12 字副标题）。
    
    5 张图的特定策略：
    - 图1（氛围）：产品居中、完整露出，保持系列统一的干净留白和柔和棚拍风格。选用与参考产品色彩协调的低饱和非白色背景，不要复杂道具或白底。
    - 图2（功效）：文案直击痛点（如：控油、舒缓）。
    - 图3（模特）：【极其重要】必须采用极简影棚风。背景为纯白、浅灰色或产品同色系的低饱和度色调。模特动作高级克制，不要杂乱场景，画面干净清透。
    - 图4（质地）：展现料体细腻感。
    - 图5（白底）：纯净展示。
    
    文案风格：参考天猫/小红书爆款，用词精准、有吸引力。`;

    const imageParts = images.map(img => ({
        inlineData: {
            mimeType: img.type,
            data: img.base64,
        },
    }));

    const response = await withTransientRetry(
        () => generateContent({
            model: textModel,
            task: 'text_gen',
            billing_task: 'text_gen',
            contents: {
                parts: [
                    ...imageParts,
                    { text: prompt },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        keywords: {
                            type: "array",
                            items: { type: "string" },
                            description: '5-7个核心卖点'
                        },
                        prompts: {
                            type: "array",
                            items: { type: "string" },
                            description: '5个定制中文提示词'
                        },
                        copies: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    mainTitle: { type: "string" },
                                    subTitle: { type: "string" }
                                },
                                required: ['mainTitle', 'subTitle']
                            },
                            description: '5组对应的营销文案'
                        }
                    },
                    required: ['keywords', 'prompts', 'copies']
                }
            }
        }),
        'product analysis',
    );

    try {
        let payload: unknown;
        try {
            payload = JSON.parse(extractJsonTextFromResponse(response));
        } catch (extractionError) {
            // Some providers return structured JSON outside the Gemini candidates field.
            const structured = response as unknown as Record<string, unknown>;
            payload = structured?.json ?? structured?.output ?? structured?.data;
            if (payload == null) throw extractionError;
        }
        return normalizeProductAnalysis(payload);
    } catch (e) {
        console.error("Analysis failed:", e);
        throw new Error(`方案规划失败：${e instanceof Error ? e.message : '请重试'}`);
    }
}

export async function generateSingleImage(
    prompt: string,
    images: ImageFile[],
    aspectRatio: AspectRatio,
    imageSize: ImageSize,
    scene: ImageScene = 'standard',
): Promise<string> {
    let lastError: unknown;
    const strategies = buildImageStrategies(prompt, scene);

    for (let index = 0; index < strategies.length; index += 1) {
        const strategy = strategies[index];
        try {
            return await generateImageByStrategy(strategy, images, aspectRatio, imageSize);
        } catch (error) {
            lastError = error;
            console.warn('[s_skincare-product-image] image strategy failed', {
                strategy: strategy.name,
                strategyIndex: index,
                totalStrategies: strategies.length,
                error,
            });
        }
    }

    if (lastError instanceof Error) {
        throw new Error(`渲染失败：${lastError.message}`);
    }

    throw new Error('渲染失败');
}

