
import { generateContent, extractJsonTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { AspectRatio, ImageResolution, PageStructureItem, ProductAnalysis, DesignTheme, TargetAudience } from "../types";

const MODEL_BY_TASK = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-3.1-flash-image-preview',
  video: 'veo_3_1',
} as const;

const PLANNING_MODEL = MODEL_BY_TASK.text;
const IMAGE_MODEL = MODEL_BY_TASK.image;
const TEXT_TASK = 'text_gen' as const;
const IMAGE_TASK = 'image_gen' as const;
const PLANNING_TIMEOUT_MS = 900000;
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1200;
const MAX_REFERENCE_IMAGES_PER_REQUEST = 3;
const MAX_ANALYSIS_IMAGES_PER_REQUEST = 1;

const RETRYABLE_ERROR_PATTERNS = [
  '502',
  '503',
  '504',
  '524',
  'bad gateway',
  'gateway time-out',
  'gateway timeout',
  'unavailable',
  'upstream',
  'failed to fetch',
  'network',
  'timeout',
];

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientGatewayError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (!message) {
    return false;
  }
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const isProxyReadTimeoutError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('proxy read timeout') || message.includes('status=524') || message.includes(' 524 ');
};

// Detects a session-expired 401 from app-manager (errOmniExecutionUnauthorized,
// message "authorization required for billed llm execution"). Such an error is
// NOT transient — retrying won't help until the user re-logs in. We classify
// it as terminal so withRetry throws immediately, then rewrite the raw English
// message to a user-friendly Chinese one in the catch below.
const isSessionExpiredError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes('authorization required for billed llm execution') ||
    message.includes('http 401') ||
    message.includes(' 401 ') ||
    message.endsWith(' 401')
  );
};

const SESSION_EXPIRED_MESSAGE = '登录已过期，请重新登录后再试。';

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = MAX_TRANSIENT_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isProxyReadTimeoutError(error)) {
        throw error;
      }
      // Session-expired 401s are terminal — no point retrying, and the parent
      // shell has already been told to log out via notifyParentAuthExpired in
      // geminiProxyService. Surface a friendly Chinese message instead of the
      // raw English "authorization required for billed llm execution".
      if (isSessionExpiredError(error)) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      const canRetry = isTransientGatewayError(error) && attempt < maxRetries - 1;
      if (!canRetry) {
        throw error;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[product-detail-page] transient ${label} error, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`, error);
      await wait(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} 失败`);
}

const isPlanningNetworkDrop = (error: any): boolean => {
  const msg = String(error?.message || error || '').toLowerCase();
  return isTransientGatewayError(error) ||
    msg.includes('empty response') ||
    msg.includes('返回空响应') ||
    msg.includes('请求超时');
};

const trimReferenceImages = (images: string[]): string[] => {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }
  return images.slice(0, MAX_REFERENCE_IMAGES_PER_REQUEST);
};

const buildFallbackAnalysis = (): ProductAnalysis => ({
  name: '未命名产品',
  category: '通用消费品',
  topBrands: ['行业头部品牌'],
  visualFeatures: ['产品主体', '材质细节', '场景氛围'],
  mood: ['专业', '可信', '高级'],
  summary: '网络波动导致分析超时，已使用通用分析模板。',
});

const buildFallbackThemes = (): DesignTheme[] => [
  {
    id: 'fallback-theme-1',
    title: '标杆品牌经典风',
    rationale: '对标头部品牌的成熟视觉语言，强调可信度与高转化信息结构。',
    visualStyle: '高级、克制、品牌感强，主视觉聚焦产品质感与核心卖点。',
    structureOutline: '以品牌叙事、核心卖点、场景转化为主线，强化专业感。',
  },
  {
    id: 'fallback-theme-2',
    title: '现代轻奢趋势风',
    rationale: '结合当前主流审美趋势，突出现代感、品质感与生活方式表达。',
    visualStyle: '现代轻奢、干净留白、层次光影，兼顾时尚与商业可读性。',
    structureOutline: '以生活方式场景与高质感细节并行，提升购买欲。',
  },
  {
    id: 'fallback-theme-3',
    title: '先锋视觉实验风',
    rationale: '打破常规构图与叙事方式，强化冲击力与记忆点，吸引注意力。',
    visualStyle: '大胆构图、强对比、情绪化灯光，形成鲜明品牌个性。',
    structureOutline: '以强视觉锚点贯穿 9 屏，突出记忆点与转化触发点。',
  },
];

const normalizePageStructureItems = (raw: any): PageStructureItem[] => {
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.sections)
      ? raw.sections
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.items)
          ? raw.items
          : [];

  const normalized: PageStructureItem[] = candidates
    .map((item: any, index: number) => {
      const sectionNumberRaw = item?.sectionNumber ?? item?.section ?? item?.index ?? (index + 1);
      const sectionNumber = Number(sectionNumberRaw);
      const sectionType = String(item?.sectionType ?? item?.title ?? item?.type ?? `第${index + 1}屏`).trim();
      const visual = String(item?.visual ?? item?.visualPrompt ?? item?.imagePrompt ?? item?.shot ?? '').trim();
      const copywriting = String(item?.copywriting ?? item?.copy ?? item?.headline ?? item?.text ?? '').trim();

      return {
        sectionNumber: Number.isFinite(sectionNumber) ? sectionNumber : (index + 1),
        sectionType,
        visual,
        copywriting,
      };
    })
    .filter((item: PageStructureItem) => item.visual || item.copywriting || item.sectionType);

  if (normalized.length === 0) {
    throw new Error('分镜结构为空，请重试。');
  }

  return normalized
    .slice(0, 9)
    .sort((a, b) => a.sectionNumber - b.sectionNumber)
    .map((item, idx) => ({
      ...item,
      sectionNumber: idx + 1,
      sectionType: item.sectionType || `第${idx + 1}屏`,
      visual: item.visual || '请突出产品主体、材质细节与场景氛围，保持商业视觉高级感。',
      copywriting: item.copywriting || `第${idx + 1}屏核心卖点展示`,
    }));
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} 超时（>${Math.floor(timeoutMs / 1000)} 秒），请重试。`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const ensureStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[、,，/]/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeAnalysis = (analysis: any): ProductAnalysis => {
  return {
    name: String(analysis?.name || '未命名产品').trim(),
    category: String(analysis?.category || '').trim(),
    topBrands: ensureStringArray(analysis?.topBrands),
    visualFeatures: ensureStringArray(analysis?.visualFeatures),
    mood: ensureStringArray(analysis?.mood),
    summary: String(analysis?.summary || '').trim(),
  };
};

const parseThemes = (raw: any): DesignTheme[] => {
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.themes)
      ? raw.themes
      : Array.isArray(raw?.data)
        ? raw.data
        : [];

  const zhFallback = [
    {
      title: '标杆品牌经典风',
      rationale: '对标头部品牌的成熟视觉语言，强调可信度与高转化信息结构。',
      visualStyle: '高级、克制、品牌感强，主视觉聚焦产品质感与核心卖点。',
    },
    {
      title: '现代轻奢趋势风',
      rationale: '结合当前主流审美趋势，突出现代感、品质感与生活方式表达。',
      visualStyle: '现代轻奢、干净留白、层次光影，兼顾时尚与商业可读性。',
    },
    {
      title: '先锋视觉实验风',
      rationale: '打破常规构图与叙事方式，强化冲击力与记忆点，吸引注意力。',
      visualStyle: '大胆构图、强对比、情绪化灯光，形成鲜明品牌个性。',
    },
  ];

  const hasChinese = (value: string): boolean => /[\u4e00-\u9fa5]/.test(value);

  return candidates
    .map((item: any, index: number) => {
      const fallback = zhFallback[index] || zhFallback[zhFallback.length - 1];
      const titleRaw = String(item?.title || `风格主题 ${index + 1}`).trim();
      const rationaleRaw = String(item?.rationale || item?.reason || '').trim();
      const visualStyleRaw = String(item?.visualStyle || item?.style || '').trim();

      return {
        id: String(item?.id || `theme-${index + 1}`),
        title: hasChinese(titleRaw) ? titleRaw : fallback.title,
        rationale: hasChinese(rationaleRaw) ? rationaleRaw : fallback.rationale,
        visualStyle: hasChinese(visualStyleRaw) ? visualStyleRaw : fallback.visualStyle,
        structureOutline: String(item?.structureOutline || item?.outline || ''),
      };
    })
    .filter((item: DesignTheme) => item.title.trim().length > 0)
    .slice(0, 3);
};

const buildFallbackStructure = (
  matchedBlueprint: string[],
  safeCategory: string,
  safeVisualFeatures: string[],
  productInfo: string,
): PageStructureItem[] => {
  const visualHint = safeVisualFeatures.join('、') || '产品主体、材质细节、场景氛围';
  const infoHint = String(productInfo || '').slice(0, 80);

  return matchedBlueprint.slice(0, 9).map((sectionType, index) => ({
    sectionNumber: index + 1,
    sectionType,
    visual: `围绕“${sectionType}”进行电影级商业构图，突出${visualHint}，类目：${safeCategory || '待识别'}。`,
    copywriting: `${sectionType}｜${infoHint || '提炼产品核心卖点并传达真实使用价值。'}`,
  }));
};

// 行业 9 屏策划蓝图字典 - 深度优化版
const INDUSTRY_BLUEPRINTS: Record<string, string[]> = {
  "酒水/白酒": [
    "意境大图海报：利用山水、云雾渲染东方人文底蕴，确立品牌高度",
    "核心价值传递：年份、古法窖池或纯粮酿造的核心卖点视觉化",
    "产地环境背书：水源、土壤、微气候的不可复制性展示",
    "古法酿造工艺：制曲、发酵、蒸馏过程的质感镜头",
    "酒体品质特写：酒线拉丝、酒花饱满、挂杯持久的微距特写",
    "感官风味描述：前中后调的味觉转译文案与意境配图",
    "核心社交场景：高端商务宴请、亲友厚礼或老友相聚氛围",
    "包装防伪细节：礼盒材质、防伪涂层及开盖仪式感展示",
    "产品参数清单：度数、香型、净含量、原料及执行标准"
  ],
  "美妆/护肤": [
    "视觉共鸣海报：针对肤质痛点（暗沉/干纹）的高级感视觉呈现",
    "核心成分科技：分子结构或核心活性成分的实验室质感展示",
    "作用原理图解：成分如何深层渗透并修护基底的科学示意",
    "肤感微距特写：液体、乳霜在皮肤上推开、吸收的电影感镜头",
    "权威实验数据：28天实测对比或SGS等机构的专业转译图表",
    "专家/奖项背书：研发总监推荐、行业大奖或核心专利证书",
    "极简使用指南：手法演示、护肤流程建议及搭配指南",
    "真实情绪反馈：模特展示使用后的自信、通透与悦己状态",
    "规格参数清单：成分表、净含量、备案号及保质期"
  ],
  "数码/家电": [
    "震撼性能海报：极具未来感的产品全景，光影勾勒轮廓",
    "硬核参数视觉：芯片、功率、转速等性能指标的数字化冲击",
    "痛点场景解决：展示产品如何解决生活中的具体繁琐（如噪音、油烟）",
    "黑科技拆解：核心专利技术的功能动态或爆炸图演示",
    "高精工艺特写：金属材质、精密零件或倒角阻尼的微距质感",
    "智能控制体验：手机互联、语音交互或自动化场景模拟",
    "效率对比验证：使用前后的数据化/可视化直观效果对比",
    "安装服务保障：产品尺寸、空间布局建议及售后政策",
    "详细技术参数：电压、功耗、尺寸、能效等级明细表"
  ],
  "服饰/箱包": [
    "风格形象海报：模特穿搭的电影质感大图，确定整体审美风格",
    "多维版型展示：正侧背多角度展示剪裁对身材的修饰力",
    "面料质感微距：高支数、纹理或功能性（防水防刮）的微距特写",
    "人体工学设计：针对穿着舒适度、受力点的细节设计展示",
    "工艺配件细节：走线平整、五金拉链的高级感细节呈现",
    "多场景穿搭秀：商务、休闲、社交等多场景下的搭配参考",
    "动态美感呈现：行进、转身时面料垂坠感与动态质感捕捉",
    "尺码选择手册：模特试穿数据、尺码表及洗涤建议",
    "参数规格明细：面料成分比例、重量、产地及品牌包装"
  ],
  "食品/零食": [
    "食欲爆发镜头：咬开后的爆浆、拉丝或冒气瞬间，视觉通感",
    "源头新鲜溯源：原材料采摘、基地环境或产地证明特写",
    "洁净工厂质感：无菌生产线、低温锁鲜或烘焙工艺的呈现",
    "多重口感分层：脆、糯、弹、滑等不同层次的视觉表达",
    "欢乐社交场景：朋友分享、午后小憩、深夜解馋的情绪渲染",
    "健康配方展示：清洁标签（0添加/低卡）的视觉化呈现",
    "人性包装细节：易拉口、独立包装、自封袋等设计展示",
    "权威品质认证：检测报告、绿色食品证或金奖证书",
    "产品规格参数：配料表、保质期、热量表及食用方法"
  ],
  "母婴用品": [
    "纯净安全海报：温润、明亮、低饱和的视觉，建立信任感",
    "核心材质解析：A类标准、零荧光、亲肤触感的微距展示",
    "科学设计原理：护脊、防胀气或防止误伤的物理结构图解",
    "高效操作细节：单手开合、易拆洗、好收纳的妈妈视角展示",
    "宝宝快乐体验：宝宝在使用过程中的舒适、安稳、开心的瞬间",
    "安全细节特写：防撞角、食品级材质、精细倒角等工艺点",
    "专业机构背书：儿科专家建议、红点奖或严苛的安全认证",
    "实验室测评：透气性、吸水性、抗震性等直观测试过程",
    "执行标准列表：成分比例、适用年龄、产地及规格明细"
  ]
};

const DEFAULT_BLUEPRINT = [
  "形象海报", "核心卖点", "场景体验", "功能解析", "细节特写", "专业背书", "用户反馈", "售后保障", "规格参数"
];

const AUDIENCE_COPY_TONE: Record<TargetAudience, string> = {
  [TargetAudience.WHITE_COLLAR]: "调性：理性、优雅、高效。侧重：节省时间、提升职业形象、极简美学。禁止：过于低幼或口语化。",
  [TargetAudience.MIDDLE_CLASS]: "调性：专业、考究、克制。侧重：工艺细节、品牌历史、材料纯度、对家人的负责。禁止：浮夸的暴发户辞藻。",
  [TargetAudience.EXQUISITE_MAMA]: "调性：温柔、细腻、安全。侧重：无菌守护、省心省力、孩子/家庭的快乐。禁止：冷冰冰的参数罗列。",
  [TargetAudience.GEN_Z]: "调性：真诚、酷、直接。侧重：悦己体验、颜值正义、社交货币（出片率）、黑科技感。禁止：传统教条式的推销。",
  [TargetAudience.SMALL_TOWN_YOUTH]: "调性：热情、直观、明快。侧重：潮流同款、大牌平替、耐用实惠、立竿见影的功效。禁止：过于生涩的英文词汇。",
  [TargetAudience.SILVER_FOX]: "调性：尊重、清晰、关怀。侧重：健康保障、操作简便、字大好读、不麻烦子女。禁止：提及“老/衰弱”等负面暗示。",
  [TargetAudience.BLUE_COLLAR]: "调性：实在、耐用、硬核。侧重：经久不坏、大功率/大容量、省钱方案、直观效果。禁止：虚头巴脑的情怀文案。",
  [TargetAudience.SMALL_TOWN_SPENDER]: "调性：华贵、尊享、体面。侧重：贵妇生活场景、邻里间的面子、奢华材质、仪式感。禁止：寒酸、廉价感描述。"
};

const AD_LAW_STRICTURE = `
【广告法强制约束】：
1. 绝对禁用词：最、第一、唯一、首个、顶尖、终极、世界级、国家级、万能、特效、立刻见效。
2. 功效描述规范：严禁承诺“根治”、“100%预防”。需将功效转化为“感官描述”。
   - 错误写法：“全网降噪最强的耳机”。
   - 正确写法：“于喧嚣中，独享那一抹如深海般的静谧”。
`;

export const analyzeProduct = async (imagesBase64: string[]): Promise<ProductAnalysis> => {
  const parts: any[] = [];
  trimReferenceImages(imagesBase64).slice(0, MAX_ANALYSIS_IMAGES_PER_REQUEST).forEach(img => {
        const cleanData = img.replace(/^data:image\/\w+;base64,/, "");
        parts.push({ inlineData: { mimeType: 'image/png', data: cleanData } });
    });

    const prompt = `
    作为资深电商视觉策划专家，请利用你的深度推理能力分析这些产品图。
    识别内容：
    1. 产品具体类目。
    2. 视觉特征与材质细节。
    3. 该类目下的全球/国内顶级“头部标杆品牌”是谁？
    请使用中文。返回 JSON 格式: { "name": "产品名", "category": "所属类目", "topBrands": ["标杆品牌名"], "visualFeatures": ["..."], "mood": ["..."], "summary": "简介" }
    `;
    parts.push({ text: prompt });

    try {
      const response = await withTimeout(withRetry(() => generateContent({
        model: PLANNING_MODEL,
        task: TEXT_TASK,
        billing_task: TEXT_TASK,
        tier: 'lite',
        contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
            type: 'object',
                    properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              topBrands: { type: 'array', items: { type: 'string' } },
              visualFeatures: { type: 'array', items: { type: 'string' } },
              mood: { type: 'array', items: { type: 'string' } },
              summary: { type: 'string' }
                    }
                }
            }
            }), '产品分析'), PLANNING_TIMEOUT_MS, '产品分析');
      const text = extractJsonTextFromResponse(response);
      if (text) return normalizeAnalysis(JSON.parse(text));
        throw new Error("Analysis failed");
    } catch (error: any) {
      if (!isPlanningNetworkDrop(error)) {
        console.warn('[product-detail-page] 产品分析异常，使用兜底分析结果', error);
      }
      return buildFallbackAnalysis();
    }
};

export const generateDesignThemes = async (analysis: any): Promise<DesignTheme[]> => {
    const normalizedAnalysis = normalizeAnalysis(analysis);
    const brandsText = normalizedAnalysis.topBrands.length > 0 ? normalizedAnalysis.topBrands.join('/') : '同类头部品牌';
    const prompt = `
    基于深度产品分析: ${JSON.stringify(normalizedAnalysis)}。
  利用 Gemini 3 Pro 的创意推理生成 3 个详情页视觉风格主题。
  【强制要求】title、rationale、visualStyle、structureOutline 全部使用简体中文，不允许英文词汇，不允许中英混写。
    1. 主题一：对标标杆品牌 ${brandsText} 的经典设计语言与排版美学。
  2. 主题二：基于该类目的国际现代轻奢趋势进行创新设计。
    3. 主题三：打破常规的先锋实验风格，强调视觉冲击力。
    返回 JSON 数组。
    `;
    try {
      const response = await withTimeout(withRetry(() => generateContent({
        model: PLANNING_MODEL,
        task: TEXT_TASK,
        billing_task: TEXT_TASK,
        tier: 'lite',
        contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
            type: 'array',
                    items: {
              type: 'object',
                        properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                rationale: { type: 'string' },
                visualStyle: { type: 'string' },
                structureOutline: { type: 'string' }
                        }
                    }
                }
            }
            }), '风格主题生成'), PLANNING_TIMEOUT_MS, '风格主题生成');
      const text = extractJsonTextFromResponse(response);
      if (text) return parseThemes(JSON.parse(text));
        return buildFallbackThemes();
    } catch (error: any) {
      if (!isPlanningNetworkDrop(error)) {
        console.warn('[product-detail-page] 风格主题生成异常，使用兜底主题', error);
      }
      return buildFallbackThemes();
    }
};

export const generatePageStructure = async (
  outlineText: string, 
  audience: TargetAudience, 
  productInfo: string, 
  analysis: ProductAnalysis
): Promise<PageStructureItem[]> => {
  const copyTone = AUDIENCE_COPY_TONE[audience];
  const normalizedAnalysis = normalizeAnalysis(analysis);
  const safeCategory = normalizedAnalysis.category;
  const safeVisualFeatures = normalizedAnalysis.visualFeatures;
  
  // 查找匹配的品类蓝图
  let matchedBlueprint = DEFAULT_BLUEPRINT;
  for (const key in INDUSTRY_BLUEPRINTS) {
      const parts = key.split('/');
      if (safeCategory && parts.some(p => safeCategory.includes(p))) {
          matchedBlueprint = INDUSTRY_BLUEPRINTS[key];
          break;
      }
  }

  const buildPrompt = (strictJson: boolean) => `
    你是一名正在进行深度策划的顶级电商策划总监。正在为“${audience}”策划详情页。
    
    【强制约束】：
    你必须生成 **恰好 9 个板块**。这是一个标准化的通用要求，旨在保证阅读体验的完整性和转化逻辑的闭环。
    
    【行业 9 屏逻辑架构】：
    ${matchedBlueprint.map((step, i) => `${i+1}. ${step}`).join('\n')}
    
    【已知信息】：
    - 产品描述：${productInfo}
    - 视觉特征：${safeVisualFeatures.join(', ') || '待补充'}
    - 类目：${safeCategory || '待识别'}
    
    【文案策划要求】：
    - 调性：${copyTone}
    - 框架：FAB模型（Feature 属性 -> Advantage 优势 -> Benefit 利益）
    - 法律合规：${AD_LAW_STRICTURE}
    - 必须参考主题大纲：${outlineText || '未提供主题大纲，请按蓝图完成标准 9 屏。'}
    
    请利用 Gemini 3 Pro 的逻辑推演能力，输出 JSON 数组，包含 9 个对象。
    - sectionNumber: 1-9
    - sectionType: 对应的蓝图环节名称
    - visual: 针对该环节的影视级画面构图、光效及模特行为描述
    - copywriting: 对应的极具煽动力的营销标题和副标题
    ${strictJson ? '不要输出任何额外解释、Markdown 或代码块，只返回 JSON。' : ''}
  `;

  try {
    const strictResponse = await withTimeout(withRetry(() => generateContent({
      model: PLANNING_MODEL,
      task: TEXT_TASK,
      billing_task: TEXT_TASK,
      tier: 'lite',
      contents: { parts: [{ text: buildPrompt(true) }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sectionNumber: { type: 'integer' },
              sectionType: { type: 'string' },
              visual: { type: 'string' },
              copywriting: { type: 'string' },
            },
            required: ["sectionNumber", "sectionType", "visual", "copywriting"]
          }
        }
      }
    }), '分镜结构生成'), PLANNING_TIMEOUT_MS, '分镜结构生成');

    const strictText = extractJsonTextFromResponse(strictResponse);
    if (strictText) {
      const parsed = JSON.parse(strictText);
      return normalizePageStructureItems(parsed);
    }
    throw new Error('分镜结构解析失败：模型未返回可用 JSON。');
  } catch (strictError: any) {
    try {
      const fallbackResponse = await withTimeout(withRetry(() => generateContent({
        model: PLANNING_MODEL,
        task: TEXT_TASK,
        billing_task: TEXT_TASK,
        tier: 'lite',
        contents: { parts: [{ text: buildPrompt(false) }] },
      }), '分镜结构重试'), PLANNING_TIMEOUT_MS, '分镜结构重试');
      const fallbackText = extractJsonTextFromResponse(fallbackResponse);
      if (fallbackText) {
        const parsed = JSON.parse(fallbackText);
        return normalizePageStructureItems(parsed);
      }
      throw new Error('重试后仍未返回可解析 JSON。');
    } catch (fallbackError: any) {
      const fallbackStructure = buildFallbackStructure(
        matchedBlueprint,
        safeCategory,
        safeVisualFeatures,
        productInfo,
      );
      if (fallbackStructure.length === 9) {
        return fallbackStructure;
      }
      const strictMsg = strictError?.message || String(strictError);
      const retryMsg = fallbackError?.message || String(fallbackError);
      throw new Error(`分镜生成失败。初次错误：${strictMsg}；重试错误：${retryMsg}`);
    }
  }
};

export const generateStoryboardImage = async (
  prompt: string,
  resolution: ImageResolution = ImageResolution.RES_1K,
  globalStyle: string = "",
  aspectRatio: AspectRatio = AspectRatio.SQUARE,
  productImages: string[] = [],
  marketingCopy: string = "",
  targetAudience: TargetAudience = TargetAudience.WHITE_COLLAR,
  specsData?: string
): Promise<string> => {
  let finalPrompt = `[Role]: Top Commercial Photographer. [Audience]: ${targetAudience}.\n`;
  finalPrompt += `[Mandatory Compliance]: Strictly NO forbidden words. \n`;
  finalPrompt += `[Fidelity]: Do NOT change product design. Use the reference images as the absolute truth for industrial design.\n`;
  
  if (prompt.includes("参数") || prompt.includes("规格")) {
      finalPrompt += `[Params UI]: Minimalist grid, high contrast, typography focused on specifications: "${specsData || 'Details TBA'}"\n`;
  }

  finalPrompt += `[Style]: ${globalStyle}\n`;
  if (marketingCopy) finalPrompt += `[Typography]: Render this Chinese text beautifully: "${marketingCopy}"\n`;
  finalPrompt += `[Render]: 8k, photorealistic, cinematic lighting, ${prompt}。\n`;

  const parts: any[] = [];
    const references = trimReferenceImages(productImages);
    if (references.length > 0) {
      references.forEach(img => {
          const cleanData = img.replace(/^data:image\/\w+;base64,/, "");
          parts.push({ inlineData: { mimeType: 'image/png', data: cleanData } });
      });
  }
  parts.push({ text: finalPrompt });

  try {
    const imageConfig: Record<string, string> = {
      aspectRatio: aspectRatio,
      imageSize: resolution,
    };

    const response = await withRetry(() => generateContent({
      model: IMAGE_MODEL,
      task: IMAGE_TASK,
      billing_task: IMAGE_TASK,
      contents: { parts },
      config: { imageConfig }
    }), '详情图生成');
    const image = extractImageFromResponse(response);
    if (image) return image;
    throw new Error("Gen failed");
  } catch (error) { throw error; }
};

export const editStoryboardImage = async (originalImageBase64: string, editInstruction: string): Promise<string> => {
  const cleanBase64 = originalImageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
  try {
    const response = await withRetry(() => generateContent({
      model: IMAGE_MODEL,
      task: IMAGE_TASK,
      billing_task: IMAGE_TASK,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
          { text: `Edit following design principles and Ad Law. Instruction: ${editInstruction}` }
        ]
      },
    }), '局部改图');
    const image = extractImageFromResponse(response);
    if (image) return image;
    throw new Error("Edit failed");
  } catch (error) { throw error; }
};
