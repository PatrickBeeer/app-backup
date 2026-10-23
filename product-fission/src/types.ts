// 商品裂变实验室 - 数据结构定义（与前端 static/app.js 读取的字段保持一致）

export interface ProductAnalysis {
  name?: string;
  category?: string;
  purpose?: string;
  material?: string;
  style?: string;
  coreFunction?: string;
  coreSellingPoints?: string[];
  problemsSolved?: string[];
  emotionalValue?: string;
  functionalValue?: string;
  suitablePriceRange?: string;
  /** AI 推断的市场参考售价区间 */
  estimatedPrice?: string;
  estimatedCost?: string;
  priceBasis?: string;
  giftable?: boolean;
  comboable?: boolean;
  packagingUpgradeable?: boolean;
  [key: string]: unknown;
}

export interface Audience {
  name?: string;
  ageRange?: string;
  identity?: string;
  usageHabit?: string;
  painPoint?: string;
  spendingPower?: string;
  whyBuy?: string;
  /** 该人群下的场景（每个人群专属，不再全局共享） */
  scenarios?: ScenarioNode[];
  [key: string]: unknown;
}

export interface Scenario {
  name?: string;
  description?: string;
  painPoint?: string;
  productSolves?: string;
  userCares?: string;
  mainImageDirection?: string;
  /** 该场景下细分出的价格档位方案（低价 / 平价 / 高价） */
  priceTiers?: PriceTierPlan[];
  [key: string]: unknown;
}

/** 场景下的一个价格档位方案：只给档位标签（低价/平价/高价），不写死具体金额 */
export interface PriceTierPlan {
  /** 价格档位：只能是 低价 / 平价 / 高价 */
  tier?: string;
  /** 该档位的商品定位 */
  positioning?: string;
  painPoint?: string;
  purchaseMotivation?: string;
  sellingPoints?: string[];
  /** 价值构成：靠 SKU / 规格 / 包装 / 赠品 / 服务 / 组合 制造差异，而不是单纯改价 */
  valueForm?: string;
  /** 为什么这个档位成立 */
  pricingReason?: string;
  productBundle?: string[];
  mainTitle?: string;
  subTitle?: string;
  mainImageCopy?: string;
  mainImageDirection?: string;
  videoIdea?: string;
  purchaseReason?: PurchaseReason;
  /** 扁平化后对应的 offers 下标（后端填充，供前端打开执行方案用） */
  _offerIdx?: number;
  [key: string]: unknown;
}

/** 带价格档位的场景节点 */
export interface ScenarioNode extends Scenario {
  priceTiers?: PriceTierPlan[];
  [key: string]: unknown;
}

/** 带场景的人群节点 */
export interface AudienceNode extends Audience {
  scenarios?: ScenarioNode[];
  [key: string]: unknown;
}

/** 三档价格标签（顺序即由低到高） */
export const PRICE_TIER_LABELS = ["低价", "平价", "高价"] as const;
export type PriceTierLabel = (typeof PRICE_TIER_LABELS)[number];

/** 主图结构中的一张：一张主图必须能直接交给设计或图片模型执行 */
export interface MainImageItem {
  /** 主图序号，如 "01" */
  index?: string;
  /** 旧字段（第几张 + 作用），兼容历史数据 */
  screen?: string;
  /** 主图类型：产品展示 / 核心卖点 / 使用场景 / 功能演示 / 效果证明 /
   *  参数证明 / 套装组合 / 价格价值 / 礼赠包装 / 品牌氛围 */
  type?: string;
  /** 页面任务：这张主图负责解决什么（通常是「让人点进来」） */
  task?: string;
  /** 核心卖点：这张主图打的卖点 */
  sellingPoint?: string;
  /** 主标题：大字文案 */
  mainTitle?: string;
  /** 副标题：补充说明 */
  subTitle?: string;
  /** 画面构思：什么场景、什么机位、画面里有什么元素、谁在什么动作 */
  visualIdea?: string;
  /** 构图方式 */
  composition?: string;
  /** 视觉证明：怎么让卖点被看见/被相信 */
  visualProof?: string;
  /** 适配原因：为什么这个人群+场景+价格必须用这一张 */
  fitReason?: string;
  /** 旧字段（场景/细节/人物使用），兼容历史数据 */
  scene?: string;
  detail?: string;
  character?: string;
  copy?: string;
  [key: string]: unknown;
}

/** 详情页结构中的一屏 */
export interface DetailPageItem {
  /** 屏序号，如 "01" */
  index?: string;
  /** 旧字段（第几屏 + 作用），兼容历史数据 */
  screen?: string;
  /** 页面角色：首屏定位 / 人群代入 / 使用场景 / 用户痛点 / 解决方案 / 核心卖点 /
   *  功能证明 / 对比证明 / 使用效果 / 产品细节 / 材质工艺 / 参数信息 /
   *  套装展示 / 信任背书 / 礼赠表达 / 转化收口 */
  role?: string;
  /** 页面任务：这一屏要说服什么 */
  task?: string;
  /** 核心主题 */
  theme?: string;
  mainTitle?: string;
  subTitle?: string;
  /** 画面构思：具体到怎么拍 */
  visualIdea?: string;
  /** 核心卖点 */
  sellingPoint?: string;
  /** 证明方式 */
  proof?: string;
  /** 用户收益 */
  benefit?: string;
  /** 与上一屏关系 */
  prevRelation?: string;
  /** 与下一屏关系 */
  nextRelation?: string;
  /** 旧字段，兼容历史数据 */
  mainIdea?: string;
  copy?: string;
  [key: string]: unknown;
}

/** 文案策略：不同人群说不同的话 */
export interface CopyStrategy {
  /** 文案语气 */
  tone?: string;
  /** 建议关键词 */
  keywords?: string[];
  /** 主标题风格 */
  mainTitleStyle?: string;
  /** 副标题风格 */
  subTitleStyle?: string;
  /** 避免使用的表达 */
  avoid?: string[];
  [key: string]: unknown;
}

/** 视觉策略：必须匹配「人群 + 场景 + 价格带」 */
export interface VisualStrategy {
  styleKeywords?: string[];
  scene?: string;
  character?: string;
  color?: string;
  lighting?: string;
  composition?: string;
  props?: string[];
  packageDisplay?: string;
  [key: string]: unknown;
}

/** 价格带策略：售价不同，页面表达重点必须不同 */
export interface PricePositioning {
  /** 价格定位 */
  positioning?: string;
  /** 消费者在这个价格下期待什么 */
  expectation?: string;
  /** 主图应该重点表达什么 */
  mainImageFocus?: string;
  /** 详情页必须证明什么 */
  detailPageProof?: string;
  /** 不适合使用什么表达 */
  avoid?: string;
  [key: string]: unknown;
}

/** 卖点四层结构：功能 / 支撑点 / 证明 / 收益 */
export interface SellingPointMatrixItem {
  feature?: string;
  mechanism?: string;
  proof?: string;
  benefit?: string;
  [key: string]: unknown;
}

/** 供图片模型直接调用的规则 */
export interface ImageGenRules {
  mainImage?: string;
  detailPage?: string;
  character?: string;
  scene?: string;
  copy?: string;
  composition?: string;
  priceBand?: string;
  [key: string]: unknown;
}

/** 单个方案的完整执行方案（点击「看执行方案」时按需生成） */
export interface ExecutionPlan {
  copyStrategy?: CopyStrategy;
  visualStrategy?: VisualStrategy;
  pricePositioning?: PricePositioning;
  sellingPointMatrix?: SellingPointMatrixItem[];
  mainImageStructure?: MainImageItem[];
  detailPageStructure?: DetailPageItem[];
  imageGenRules?: ImageGenRules;
  [key: string]: unknown;
}

export interface PurchaseReason {
  who?: string;
  when?: string;
  why?: string;
  whyPrice?: string;
  [key: string]: unknown;
}

export interface Offer {
  offerName?: string;
  positioning?: string;
  targetAudience?: string;
  scenario?: string;
  painPoint?: string;
  purchaseMotivation?: string;
  sellingPoints?: string[];
  recommendedPrice?: string;
  pricingReason?: string;
  productBundle?: string[];
  mainTitle?: string;
  subTitle?: string;
  mainImageCopy?: string;
  mainImageDirection?: string;
  /** 逐张主图：类型 / 任务 / 卖点 / 主副标题 / 画面构思 / 构图 / 视觉证明 / 适配原因 */
  mainImageStructure?: MainImageItem[];
  detailPageStructure?: DetailPageItem[];
  videoIdea?: string;
  priceTier?: string;
  purchaseReason?: PurchaseReason;
  qualityReport?: QualityReport;
  /** 方案策略层：决定这个页面「怎么说、长什么样、凭什么值这个价」 */
  copyStrategy?: CopyStrategy;
  visualStrategy?: VisualStrategy;
  pricePositioning?: PricePositioning;
  sellingPointMatrix?: SellingPointMatrixItem[];
  /** 执行方案：主图结构 + 详情页结构 + 图片生成规则（点击「看执行方案」时按需生成） */
  executionPlan?: ExecutionPlan;
  [key: string]: unknown;
}

export interface PriceTierCard {
  tier?: string;
  price?: string;
  form?: string;
  audience?: string;
  sellingPoint?: string;
  [key: string]: unknown;
}

export interface PriceStrategy {
  traffic?: PriceTierCard;
  main?: PriceTierCard;
  gift?: PriceTierCard;
  premium?: PriceTierCard;
  [key: string]: unknown;
}

export interface QualityIssue {
  severity: string;
  field: string;
  message: string;
  suggestion: string;
}

export interface QualityReport {
  score: number;
  level: string;
  issues: QualityIssue[];
}

export interface AnalysisResult {
  productAnalysis?: ProductAnalysis;
  /** 人群 → 场景 → 价格档位 的三级结构（页面主结构） */
  audiences?: AudienceNode[];
  /** 由三级结构扁平化出来的方案列表，供执行方案生成与质量检查使用 */
  offers?: Offer[];
  qualityReport?: QualityReport & { issueCount?: number; failCount?: number };
  [key: string]: unknown;
}

export interface AnalyzePayload {
  name?: string;
  price?: string;
  cost?: string;
  /** 已废弃：平台选项已下线，保留字段仅为兼容旧数据 */
  platform?: string;
  /** 已废弃：可调整内容选项已下线，保留字段仅为兼容旧数据 */
  adjustable?: string[];
  /** data URL，如 data:image/jpeg;base64,.... */
  image?: string | null;
}

/** 生成某个方案「执行方案」时的入参：产品 DNA + 该方案本身 */
export interface ExecutionPayload {
  productAnalysis?: ProductAnalysis;
  offer?: Offer;
}
