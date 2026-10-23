// 商品裂变实验室 - 浏览器端 AI 分析与结果归一化
//
// 负责把「产品图片」交给大模型，返回严格结构化的 JSON：
//   productAnalysis / audiences（人群 → 场景 → 价格档位 三级结构）
// 三级结构会在 normalizeResult 里被扁平化成 offers，供执行方案生成与质量检查使用。
//
// 生产请求统一通过 UnityShop API Manager；本地可用 VITE_DEMO_MODE 启用演示数据。

import type {
  AnalysisResult,
  AnalyzePayload,
  AudienceNode,
  ExecutionPayload,
  ExecutionPlan,
  MainImageItem,
  DetailPageItem,
  Offer,
  PriceTierPlan,
  ScenarioNode,
} from "./types";
import { extractText, generateContent } from "./apiManager";

export const MODEL = "gemini-3-flash-preview";
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

// ----------------------------------------------------------------------------
// 提示词
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT =
  "你是一位资深的电商商品策略专家，擅长「商品裂变」：先找出这个产品真正适合的人群，" +
  "再为每个人群找到它专属的使用场景，最后在每个场景里按「低价 / 平价 / 高价」细分出不同的卖法。" +
  "你输出的价格只能用档位词表达，绝不写具体金额。你必须只输出 JSON，不要输出任何解释性文字。";

const USER_PROMPT_TEMPLATE = `# 任务：商品裂变分析（人群 → 场景 → 价格档位）

## 用户输入
- 产品图片：已附在消息中（**这是唯一输入，请识别图片里的产品是什么**）

商家没有填写任何文字信息 —— 产品名称、品类、材质、风格、价格带全部由你从图片和常识推断，不要向商家索取：
- 产品名称 / 品类 / 材质 / 风格：基于图片识别，禁止输出「未填写」「未知」之类占位内容；
- 参考售价 estimatedPrice：基于同类目、同材质、同风格产品的真实市场行情推断，
  给出价位区间（如「79-129元」），这是你的推断值，不是商家给出的价格；
- 推测成本 estimatedCost：按该类目常见成本率推断，用于判断还有多少价格空间；
- 推断依据 priceBasis：一句话说明你凭什么判断这个价格带（同类产品行情 / 材质工艺 / 档次定位）。
绝对不要因为商家没提供售价，就把任何价格相关字段留空或写「不确定」。

## 工作流程（请严格按此思考，但最终只输出 JSON）

### 第一步：产品 DNA 分析
分析产品：是什么、类目、用途、材质、风格、核心功能、核心卖点、能解决什么问题、
情绪价值、功能价值、适合的价格区间、是否适合礼赠、是否适合组合装、是否适合包装升级。
同时给出你推断的市场参考售价与成本（estimatedPrice / estimatedCost / priceBasis），
后续所有档位划分都以这个参考价带为锚点。

### 第二步：人群分层（严格 8 类）
【硬约束】必须输出 **正好 8 类人群**，不多不少。输出前自己数一遍 audiences 数组长度。
每一类都要是「具体」人群：不要只给「18-25岁女性」这种标签，要具体到生活方式与痛点。
8 类之间必须在「年龄 / 身份 / 生活状态 / 消费能力」上明显拉开差距，
建议覆盖不同角度（如：学生 / 职场新人 / 资深白领 / 宝妈宝爸 / 送礼者 / 差旅党 / 健身或户外 / 居家长辈），
具体按这个产品的实际情况定，不要硬套。
每个人群包含：人群名称、年龄范围、身份、使用习惯、核心痛点、消费能力、为什么购买。
【硬约束】人群必须精准，**严禁使用「所有人」「大众」「通用」「用户群体」这类泛化表述**；
每一类都要能画出具体画像，宁缺毋滥。

### 第三步：给每个人群配它自己的场景（每人 1-2 个）
场景必须从这个人群的生活方式里长出来，**不同人群的场景不允许重复**。
每个场景包含：场景名称、场景描述、场景痛点、产品解决什么问题、用户最关心什么卖点、主图应该表现什么。
【硬约束】使用场景必须具体，**严禁使用「日常使用」「居家」「通用场景」这种空泛词**；
必须落到具体情境（什么时间、什么地点、正在做什么动作）。

### 第四步：给每个场景细分价格档位（每个场景 1-3 个）
档位**只能使用这三个标签之一：低价 / 平价 / 高价**。
【怎么决定分几档】**看这个人群在这个场景里的价格空间，不要平均分配、也不要硬凑三档**：
- 价格空间大的场景（消费能力强、愿意为材质/包装/服务升级付费、或存在礼赠与自用两种心智）
  → 拆到 2-3 档（如 低价 + 平价 + 高价）；
- 价格空间小的场景（预算敏感、冲动型、只解决一个具体问题）
  → 1-2 档就够（如只给「低价」或「低价 + 平价」）。
**每个人群至少要有 1 个档位**；同一个场景下不要求三档齐全，但**档位之间必须有真实价值差**。
同一个场景里出现多个档位时，建议从低到高依次排列，不要跳着给。
【硬约束】档位方案里禁止出现任何具体金额、价格数字、价格区间，或「参考价的 X 折 / X 倍」这类换算，
定价高低一律只用「低价 / 平价 / 高价」表达，违反即重写。
同一场景下的不同档位，差异必须来自**商品形态与价值构成**——
规格/数量、材质/工艺、包装/礼盒、赠品/配件、服务/保障、组合方式，
**禁止把同一件商品换个价就算一个档位**。
每个档位包含：
- tier：只能是「低价」「平价」「高价」三者之一；
- positioning：这个档位的商品定位（一句话）；
- painPoint / purchaseMotivation：这个档位打动的痛点与购买动机，必须跟着档位变
  （低价 = 想先试试、够用划算、降低决策门槛；平价 = 想要稳定靠谱的完整体验；
    高价 = 想要一步到位、更好的材质工艺与更全的服务）；
- sellingPoints：3-5 条核心卖点数组；
- valueForm：这个档位的价值构成（比低一档多出来的是什么：规格 / 材质 / 包装 / 赠品 / 服务 / 组合）；
- pricingReason：为什么这个档位成立（讲价值构成，**禁止出现金额**）；
- productBundle：商品组合建议数组（如 ["单品","2件套","产品+礼盒+贺卡"]）；
- mainTitle（商品主标题，偏电商、像真人写的，禁止出现「开启品质生活/重新定义/赋能/极致体验」等空洞词，
  应围绕 场景+痛点+购买理由）、subTitle（副标题）、mainImageCopy（主图文案，一句）；
- mainImageDirection（主图视觉总纲：**把抽象卖点转成可拍摄的视觉动作**——持久→时间推移状态不变；
  轻薄→质地透光/可卷曲；大容量→与常见参照物对比；强效→使用瞬间的变化冲击；
  天然→自然元素环绕；精准→精密刻度/对比）；
- videoIdea：15-30 秒短视频方向，必须细到 5-7 个镜头/时间段（开场钩子、痛点、产品出现、卖点证明、价值构成、结尾行动）；
- purchaseReason 对象，必须回答 4 个问题：who（谁会买）、when（在什么情况下买）、
  why（为什么会买）、whyPrice（为什么愿意在这个档位买单，**同样禁止出现金额**）。
  答不清楚这 4 个问题的档位不成立，应被删掉。

### 第五步：数量自检（逐条过，违反任一条都要重写）
1. 人群是否明确且正好 8 类  2. 场景是否属于该人群、且不与别的人群重复  3. 痛点是否真实存在
4. 同一场景下的档位差异是否体现在商品形态上  5. 全文是否出现了具体金额（出现即重写）
6. 是否方便做主图与短视频内容
7. 【数量约束】档位方案总数（所有场景的档位加起来）**不锁死固定值，按人群实际需要来**：
   每个人群至少 1 个档位，价格空间大的多给、空间小的少给，通常落在 **10-18 个**，最多不超过 20 个。
   宁可少，也不要为了凑数生成雷同的档位；输出前请把所有档位数一遍。

## 输出格式（严格 JSON，不要任何 markdown 代码块、不要解释）
{
  "productAnalysis": {
    "name": "", "category": "", "purpose": "", "material": "", "style": "",
    "coreFunction": "", "coreSellingPoints": [], "problemsSolved": [],
    "emotionalValue": "", "functionalValue": "", "suitablePriceRange": "",
    "estimatedPrice": "（AI 推断的市场参考售价区间）", "estimatedCost": "（AI 推测成本）",
    "priceBasis": "（推断这个价格带的依据，一句话）",
    "giftable": true, "comboable": true, "packagingUpgradeable": true
  },
  "audiences": [
    {
      "name": "", "ageRange": "", "identity": "", "usageHabit": "",
      "painPoint": "", "spendingPower": "", "whyBuy": "",
      "scenarios": [
        {
          "name": "", "description": "", "painPoint": "", "productSolves": "",
          "userCares": "", "mainImageDirection": "",
          "priceTiers": [
            {
              "tier": "低价",
              "positioning": "", "painPoint": "", "purchaseMotivation": "",
              "sellingPoints": ["", ""],
              "valueForm": "", "pricingReason": "", "productBundle": [""],
              "mainTitle": "", "subTitle": "", "mainImageCopy": "", "mainImageDirection": "",
              "videoIdea": "0-3秒：；3-7秒：；7-12秒：；12-18秒：；18-24秒：；24-30秒：",
              "purchaseReason": {"who": "", "when": "", "why": "", "whyPrice": ""}
            },
            {
              "tier": "平价",
              "positioning": "", "painPoint": "", "purchaseMotivation": "",
              "sellingPoints": ["", ""],
              "valueForm": "", "pricingReason": "", "productBundle": [""],
              "mainTitle": "", "subTitle": "", "mainImageCopy": "", "mainImageDirection": "",
              "videoIdea": "0-3秒：；3-7秒：；7-12秒：；12-18秒：；18-24秒：；24-30秒：",
              "purchaseReason": {"who": "", "when": "", "why": "", "whyPrice": ""}
            }
          ]
        }
      ]
    }
  ]
}
`;

// ----------------------------------------------------------------------------
// 真实调用
// ----------------------------------------------------------------------------
type ChatMessage = { role: string; content: unknown };

/** 注意：产品名称/售价/成本不再由用户填写，全部交给模型从图片推断；
 *  「销售平台」与「可调整内容」两个选项已下线，不再参与提示词组装。 */
export function buildMessages(payload: AnalyzePayload): ChatMessage[] {
  const text = USER_PROMPT_TEMPLATE;

  const content: unknown[] = [];
  const img = payload.image;
  if (img) {
    // img 形如 "data:image/jpeg;base64,...."
    content.push({ type: "image_url", image_url: { url: img } });
  }
  content.push({ type: "text", text });
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];
}

export class JSONExtractError extends Error {
  raw: string;
  constructor(message: string, raw = "") {
    super(message);
    this.name = "JSONExtractError";
    this.raw = raw;
  }
}

// 容错归一化要识别的「外层包装」键（借鉴 abingyyds 的 union schema 思路）
const WRAPPER_KEYS = ["result", "data", "output", "response", "analysis"];

/** 把模型输出解析成 dict，并兼容多种 LLM 包装习惯。
 *
 * 支持：裸 JSON 对象 / ```json 代码块 / 被多余文本包围的 JSON /
 * 外层包了 {result:{...}} / {data:{...}} / {output:{...}} / 数组包裹。
 * 解析失败抛出 JSONExtractError（带 raw 供修复），而不是让上层拿到空结构。 */
export function extractJson(text: string): AnalysisResult {
  const raw = text;

  const stripFence = (s: string): string => {
    const t = s.trim();
    const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
    return m ? m[1].trim() : t;
  };

  const locateBraces = (s: string): string => {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return s.slice(start, end + 1);
    // 可能是数组
    const a = s.indexOf("[");
    const b = s.lastIndexOf("]");
    if (a !== -1 && b !== -1 && b > a) return s.slice(a, b + 1);
    return s;
  };

  const candidates = [raw, stripFence(raw), locateBraces(raw), locateBraces(stripFence(raw))];
  for (const cand of candidates) {
    const c = cand.trim();
    if (!c) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(c);
    } catch {
      continue;
    }
    // 数组包裹：取第一个对象元素
    if (Array.isArray(obj)) {
      obj = obj.find((x) => x && typeof x === "object" && !Array.isArray(x));
      if (!obj) continue;
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return unwrap(obj as AnalysisResult);
    }
  }
  throw new JSONExtractError("无法从模型输出中解析出合法 JSON", raw);
}

/** 若 obj 是 {result:{...}} / {data:{...}} 这类包装，剥到内层真正的结构。 */
export function unwrap(obj: AnalysisResult): AnalysisResult {
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    const only = (obj as Record<string, unknown>)[keys[0]];
    if (only && typeof only === "object" && !Array.isArray(only)) {
      const inner = only as Record<string, unknown>;
      if (["productAnalysis", "offers", "audiences", "priceStrategy"].some((k) => k in inner)) {
        return inner as AnalysisResult;
      }
    }
  }
  // 也可能是 {result: {...含 offers...}} 但 keys 在外层混合，做一次浅展开尝试
  for (const wk of WRAPPER_KEYS) {
    const v = (obj as Record<string, unknown>)[wk];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      if (["productAnalysis", "offers", "audiences", "priceStrategy"].some((k) => k in inner)) {
        return inner as AnalysisResult;
      }
    }
  }
  return obj;
}

// 字段默认值表：缺失时补空值，避免前端取不到字段
const OFFER_DEFAULTS: Record<string, unknown> = {
  offerName: "", positioning: "", targetAudience: "", scenario: "",
  painPoint: "", purchaseMotivation: "", sellingPoints: [],
  recommendedPrice: "", pricingReason: "", productBundle: [],
  mainTitle: "", subTitle: "", mainImageCopy: "", mainImageDirection: "",
  mainImageStructure: [], detailPageStructure: [], videoIdea: "",
  priceTier: "", purchaseReason: { who: "", when: "", why: "", whyPrice: "" },
  copyStrategy: { tone: "", keywords: [], mainTitleStyle: "", subTitleStyle: "", avoid: [] },
  visualStrategy: { styleKeywords: [], scene: "", character: "", color: "", lighting: "", composition: "", props: [], packageDisplay: "" },
  pricePositioning: { positioning: "", expectation: "", mainImageFocus: "", detailPageProof: "", avoid: "" },
  sellingPointMatrix: [],
};
const PROFILE_DEFAULTS: Record<string, unknown> = {
  name: "", category: "", purpose: "", material: "", style: "",
  coreFunction: "", coreSellingPoints: [], problemsSolved: [],
  emotionalValue: "", functionalValue: "", suitablePriceRange: "",
  estimatedPrice: "", estimatedCost: "", priceBasis: "",
  giftable: false, comboable: false, packagingUpgradeable: false,
};

// 价格档位：页面只认「低价 / 平价 / 高价」三个词，任何具体金额都不往下传
const TIER_ALIASES: Array<[string, string]> = [
  ["低价", "低价"], ["低端", "低价"], ["引流", "低价"], ["入门", "低价"], ["便宜", "低价"], ["基础", "低价"],
  ["平价", "平价"], ["中价", "平价"], ["中端", "平价"], ["主销", "平价"], ["标准", "平价"], ["常规", "平价"],
  ["高价", "高价"], ["高端", "高价"], ["礼赠", "高价"], ["精装", "高价"], ["顶配", "高价"], ["旗舰", "高价"],
];
const TIER_ORDER: Record<string, number> = { 低价: 0, 平价: 1, 高价: 2 };

/** 把模型各种档位写法收敛成「低价 / 平价 / 高价」（识别不了时按平价处理）。 */
export function canonicalTier(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "平价";
  for (const [key, val] of TIER_ALIASES) if (s.includes(key)) return val;
  return "平价";
}

/**
 * 兜底：模型偶尔会按旧格式返回扁平 offers（+ 顶层 scenarios），
 * 这里把它拼回「人群 → 场景 → 档位」三级结构，避免整页空白。
 */
function treeFromLegacyOffers(rec: Record<string, unknown>): AudienceNode[] {
  const offers = Array.isArray(rec.offers) ? (rec.offers as Offer[]) : [];
  const scenarioIndex = new Map<string, Record<string, unknown>>();
  for (const s of Array.isArray(rec.scenarios) ? (rec.scenarios as Record<string, unknown>[]) : []) {
    if (s && typeof s === "object") scenarioIndex.set(String(s.name || "").trim(), s);
  }

  const audMap = new Map<string, { node: AudienceNode; scn: Map<string, ScenarioNode> }>();
  for (const o of offers) {
    if (!o || typeof o !== "object") continue;
    const oRec = o as Record<string, unknown>;
    const audName = String(oRec.targetAudience || oRec.audienceName || "未分组人群").trim();
    const scnName = String(oRec.scenario || "未分组场景").trim();
    if (!audMap.has(audName)) audMap.set(audName, { node: { name: audName, scenarios: [] }, scn: new Map() });
    const bucket = audMap.get(audName);
    if (!bucket) continue;
    if (!bucket.scn.has(scnName)) {
      const base = scenarioIndex.get(scnName) || {};
      bucket.scn.set(scnName, {
        name: scnName,
        description: base.description,
        painPoint: base.painPoint,
        productSolves: base.productSolves,
        userCares: base.userCares,
        mainImageDirection: base.mainImageDirection,
        priceTiers: [],
      } as ScenarioNode);
    }
    const scnNode = bucket.scn.get(scnName);
    if (!scnNode) continue;
    const pr = (oRec.purchaseReason && typeof oRec.purchaseReason === "object"
      ? oRec.purchaseReason
      : {}) as Record<string, unknown>;
    const bundle = Array.isArray(oRec.productBundle) ? (oRec.productBundle as string[]) : [];
    scnNode.priceTiers = scnNode.priceTiers || [];
    scnNode.priceTiers.push({
      tier: canonicalTier(oRec.priceTier ?? oRec.recommendedPrice),
      positioning: oRec.positioning,
      painPoint: oRec.painPoint,
      purchaseMotivation: oRec.purchaseMotivation,
      sellingPoints: Array.isArray(oRec.sellingPoints) ? (oRec.sellingPoints as string[]) : [],
      valueForm: oRec.valueForm ?? bundle.join("、"),
      pricingReason: oRec.pricingReason,
      productBundle: bundle,
      mainTitle: oRec.mainTitle,
      subTitle: oRec.subTitle,
      mainImageCopy: oRec.mainImageCopy,
      mainImageDirection: oRec.mainImageDirection,
      videoIdea: oRec.videoIdea,
      purchaseReason: { who: pr.who, when: pr.when, why: pr.why, whyPrice: pr.whyPrice },
    } as PriceTierPlan);
  }

  const out: AudienceNode[] = [];
  for (const { node, scn } of audMap.values()) {
    node.scenarios = Array.from(scn.values());
    out.push(node);
  }
  return out;
}

/**
 * 归一化「人群 → 场景 → 价格档位」三级结构：
 * 补空字段、把档位收敛成三档、按低价→平价→高价排序，然后扁平化成 offers。
 */
export function normalizeTree(result: AnalysisResult): AnalysisResult {
  const rec = result as Record<string, unknown>;
  const rawAudiences = Array.isArray(rec.audiences) ? (rec.audiences as AudienceNode[]) : [];
  let audiences = rawAudiences.filter((a) => a && typeof a === "object");
  // 模型若仍返回旧的扁平结构，先兜底拼成三级结构
  if (!audiences.some((a) => Array.isArray(a.scenarios) && a.scenarios.length)) {
    const legacy = treeFromLegacyOffers(rec);
    if (legacy.length) audiences = legacy;
  }

  const audOut: AudienceNode[] = [];
  for (const a of audiences) {
    if (!a || typeof a !== "object") continue;
    const aRec = a as Record<string, unknown>;
    for (const fk of ["name", "ageRange", "identity", "usageHabit", "painPoint", "spendingPower", "whyBuy"]) {
      if (aRec[fk] === undefined) aRec[fk] = "";
    }
    const rawScenarios = Array.isArray(aRec.scenarios) ? (aRec.scenarios as ScenarioNode[]) : [];
    const scnOut: ScenarioNode[] = [];
    for (const s of rawScenarios) {
      if (!s || typeof s !== "object") continue;
      const sRec = s as Record<string, unknown>;
      for (const fk of ["name", "description", "painPoint", "productSolves", "userCares", "mainImageDirection"]) {
        if (sRec[fk] === undefined) sRec[fk] = "";
      }
      if (!String(sRec.name || "").trim()) {
        // 场景缺名字时用描述兜底，避免前端渲染出空白标题
        sRec.name = String(sRec.description || "").slice(0, 20) || "未命名场景";
      }
      const rawTiers = Array.isArray(sRec.priceTiers) ? (sRec.priceTiers as PriceTierPlan[]) : [];
      const tierOut: PriceTierPlan[] = [];
      for (const t of rawTiers) {
        if (!t || typeof t !== "object") continue;
        const tRec = t as Record<string, unknown>;
        tRec.tier = canonicalTier(tRec.tier);
        for (const fk of [
          "positioning", "painPoint", "purchaseMotivation", "valueForm", "pricingReason",
          "mainTitle", "subTitle", "mainImageCopy", "mainImageDirection", "videoIdea",
        ]) {
          if (tRec[fk] === undefined) tRec[fk] = "";
        }
        if (!Array.isArray(tRec.sellingPoints)) tRec.sellingPoints = [];
        if (!Array.isArray(tRec.productBundle)) tRec.productBundle = [];
        if (!tRec.purchaseReason || typeof tRec.purchaseReason !== "object") tRec.purchaseReason = {};
        for (const pk of ["who", "when", "why", "whyPrice"]) {
          if ((tRec.purchaseReason as Record<string, unknown>)[pk] === undefined) {
            (tRec.purchaseReason as Record<string, unknown>)[pk] = "";
          }
        }
        tierOut.push(t as PriceTierPlan);
      }
      tierOut.sort((x, y) => (TIER_ORDER[String(x.tier)] ?? 1) - (TIER_ORDER[String(y.tier)] ?? 1));
      sRec.priceTiers = tierOut;
      scnOut.push(s as ScenarioNode);
    }
    aRec.scenarios = scnOut;
    audOut.push(a as AudienceNode);
  }
  rec.audiences = audOut;
  return flattenTree(result);
}

/**
 * 把三级结构扁平化成 offers：每一个「人群 × 场景 × 档位」都是一个可生成执行方案的方案。
 * 执行方案生成与质量检查都基于 offers，三级结构只负责页面展示。
 */
export function flattenTree(result: AnalysisResult): AnalysisResult {
  const rec = result as Record<string, unknown>;
  const audiences = Array.isArray(rec.audiences) ? (rec.audiences as AudienceNode[]) : [];
  const offers: Offer[] = [];

  for (const a of audiences) {
    if (!a || typeof a !== "object") continue;
    const aRec = a as Record<string, unknown>;
    const audName = String(aRec.name || "").trim();
    const scenarios = Array.isArray(aRec.scenarios) ? (aRec.scenarios as ScenarioNode[]) : [];
    for (const s of scenarios) {
      if (!s || typeof s !== "object") continue;
      const sRec = s as Record<string, unknown>;
      const scnName = String(sRec.name || "").trim();
      const tiers = Array.isArray(sRec.priceTiers) ? (sRec.priceTiers as PriceTierPlan[]) : [];
      for (const t of tiers) {
        if (!t || typeof t !== "object") continue;
        const tRec = t as Record<string, unknown>;
        const tier = canonicalTier(tRec.tier);
        const idx = offers.length;
        tRec.tier = tier;
        // 前端点这个档位时，用这个下标打开对应的执行方案
        tRec._offerIdx = idx;
        const pr = (tRec.purchaseReason && typeof tRec.purchaseReason === "object"
          ? tRec.purchaseReason
          : {}) as Record<string, unknown>;
        offers.push({
          offerName: `方案${String(idx + 1).padStart(2, "0")}`,
          audienceName: audName,
          scenarioName: scnName,
          targetAudience: audName,
          scenario: scnName,
          priceTier: tier,
          // 价格不写死：recommendedPrice 直接用档位词，页面上显示为「价格档位」
          recommendedPrice: tier,
          valueForm: String(tRec.valueForm || ""),
          positioning: String(tRec.positioning || ""),
          painPoint: String(tRec.painPoint || ""),
          purchaseMotivation: String(tRec.purchaseMotivation || ""),
          sellingPoints: Array.isArray(tRec.sellingPoints) ? (tRec.sellingPoints as string[]) : [],
          pricingReason: String(tRec.pricingReason || ""),
          productBundle: Array.isArray(tRec.productBundle) ? (tRec.productBundle as string[]) : [],
          mainTitle: String(tRec.mainTitle || ""),
          subTitle: String(tRec.subTitle || ""),
          mainImageCopy: String(tRec.mainImageCopy || ""),
          mainImageDirection: String(tRec.mainImageDirection || ""),
          videoIdea: String(tRec.videoIdea || ""),
          purchaseReason: {
            who: String(pr.who || ""),
            when: String(pr.when || ""),
            why: String(pr.why || ""),
            whyPrice: String(pr.whyPrice || ""),
          },
        } as unknown as Offer);
      }
    }
  }
  rec.offers = offers;
  return result;
}

/**
 * 数量收敛：目标「8 大人群 / 方案数按人群实际价格空间浮动」。
 * - 人群超过 maxAudiences 时截断（优先保留有场景、有档位的人群）；
 * - 档位方案超过 maxOffers 时截断，但保证每个人群至少留下 1 个档位；
 * - 少于目标数量不补（系统不会凭空造内容，只做上限约束）。
 * 模型一般能按提示词给准，这里是防止偶尔超量导致页面过长。
 */
export function capTreeLimits(
  result: AnalysisResult,
  maxAudiences = 8,
  maxOffers = 20,
): AnalysisResult {
  const rec = result as Record<string, unknown>;
  let audiences = (Array.isArray(rec.audiences) ? rec.audiences : []) as AudienceNode[];
  if (!audiences.length) return result;

  const tierCount = (a: AudienceNode): number =>
    ((a && a.scenarios) || []).reduce((n, s) => n + ((s && s.priceTiers) || []).length, 0);

  // 1) 人群截断：有档位的优先，其次有场景的，保持原顺序
  if (audiences.length > maxAudiences) {
    const ranked = audiences
      .map((a, i) => ({ a, i, score: tierCount(a) > 0 ? 2 : ((a.scenarios || []).length ? 1 : 0) }))
      .sort((x, y) => y.score - x.score || x.i - y.i)
      .slice(0, maxAudiences)
      .sort((x, y) => x.i - y.i)
      .map((x) => x.a);
    audiences = ranked;
  }

  const totalTiers = audiences.reduce((n, a) => n + tierCount(a), 0);

  // 2) 方案截断：先给每个人群留 1 个，再按原顺序补齐到 maxOffers
  if (totalTiers > maxOffers) {
    const keep = new Set<string>();
    const order: { a: number; s: number; t: number }[] = [];
    audiences.forEach((a, ai) => {
      (a.scenarios || []).forEach((s, si) => {
        (s.priceTiers || []).forEach((_t, ti) => order.push({ a: ai, s: si, t: ti }));
      });
    });
    // 每个人群的头一个档位先占位
    audiences.forEach((a, ai) => {
      const scns = a.scenarios || [];
      for (let si = 0; si < scns.length; si += 1) {
        if ((scns[si].priceTiers || []).length) {
          keep.add(`${ai}-${si}-0`);
          return;
        }
      }
    });
    for (const ref of order) {
      if (keep.size >= maxOffers) break;
      keep.add(`${ref.a}-${ref.s}-${ref.t}`);
    }
    audiences = audiences.map((a, ai) => {
      const scenarios = (a.scenarios || [])
        .map((s, si) => {
          const tiers = (s.priceTiers || []).filter((_t, ti) => keep.has(`${ai}-${si}-${ti}`));
          return { ...s, priceTiers: tiers };
        })
        .filter((s) => (s.priceTiers || []).length);
      return { ...a, scenarios };
    });
  }

  rec.audiences = audiences;
  return result;
}

/** 补全缺失字段，保证前端拿到结构完整的结果（缺失不崩，只填空）。 */
export function normalizeResult(result: AnalysisResult): AnalysisResult {
  let out: AnalysisResult = result && typeof result === "object" && !Array.isArray(result) ? result : {};
  const rec = out as Record<string, unknown>;

  let pa = rec.productAnalysis;
  if (!pa || typeof pa !== "object" || Array.isArray(pa)) pa = {};
  for (const [k, v] of Object.entries(PROFILE_DEFAULTS)) {
    if ((pa as Record<string, unknown>)[k] === undefined) {
      (pa as Record<string, unknown>)[k] = Array.isArray(v) ? [] : v && typeof v === "object" ? {} : v;
    }
  }
  rec.productAnalysis = pa;

  // 三级结构：人群 → 场景 → 价格档位（内部会扁平化出 offers）
  normalizeTree(out);
  // 数量收敛：人群上限 8、方案上限 20（下限不锁，按人群实际价格空间浮动）
  capTreeLimits(out);
  // 收敛后重新扁平化，保证 offers 与页面上的档位一一对应
  flattenTree(out);

  // offer 字段补全
  for (const off of (rec.offers as Offer[]) || []) {
    if (!off || typeof off !== "object") continue;
    const offRec = off as Record<string, unknown>;
    for (const [k, v] of Object.entries(OFFER_DEFAULTS)) {
      if (offRec[k] === undefined) {
        offRec[k] = Array.isArray(v) ? [] : v && typeof v === "object" ? { ...(v as object) } : v;
      }
    }
    let pr = off.purchaseReason;
    if (!pr || typeof pr !== "object") pr = {};
    for (const pk of ["who", "when", "why", "whyPrice"]) {
      if ((pr as Record<string, unknown>)[pk] === undefined) (pr as Record<string, unknown>)[pk] = "";
    }
    off.purchaseReason = pr;
  }
  return out;
}

// ----------------------------------------------------------------------------
// JSON 修复（借鉴 abingyyds 的 repair prompt：解析失败把原文喂回 LLM 修一次）
// ----------------------------------------------------------------------------
const REPAIR_SYSTEM =
  "你是一个严格的 JSON 修复器。我会给你一段本应是合法 JSON 对象的文本（通常来自大模型输出），" +
  "但它无法直接被解析。请你：1) 修正其中的语法错误（多余逗号、未闭合括号、换行、注释等）；" +
  "2) 如果某些字段确实缺失，用空字符串或空数组补齐；3) 只输出一个完整、可被解析的" +
  "JSON 对象，不要任何解释、不要 markdown 代码块、不要前后文字。";

export function buildRepairMessages(raw: string): ChatMessage[] {
  const text = (raw || "").slice(0, 12000); // 截断，避免超长
  return [
    { role: "system", content: REPAIR_SYSTEM },
    { role: "user", content: `请修复下面这段文本为合法 JSON：\n\n${text}` },
  ];
}

export async function repairJson(raw: string): Promise<string> {
  try {
    return await callLlm(buildRepairMessages(raw), 8000);
  } catch (e) {
    throw new JSONExtractError(`修复失败：${(e as Error).message}`, raw);
  }
}

export function looksLikeHtml(text: string): boolean {
  const t = (text || "").trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || (text || "").slice(0, 500).includes('id="root"');
}

/** 把上游原始报错映射成中文人话（借鉴 abingyyds 的错误归一化）。 */
export function humanizeError(msg: string): string {
  const s = (msg || "").toLowerCase();
  if (s.includes("insufficient_quota") || s.includes("quota")) {
    return "AI 服务额度已用尽，请联系管理员";
  }
  if ((s.includes("limit") && s.includes("rate")) || s.includes("429")) {
    return "请求过于频繁被限流，请等待几十秒后重试";
  }
  if (s.includes("401") || s.includes("403") || s.includes("unauthorized") || s.includes("authentication") || s.includes("api key")) {
    return "登录状态已失效，请重新登录后再试";
  }
  if (s.includes("timeout")) {
    return "请求超时，可能是网络或上游响应慢，请稍后重试";
  }
  if (s.includes("winerror 10013") || s.includes("failed to establish a new connection")) {
    return "无法连接 AI 服务，请检查网络后重试";
  }
  if (s.includes("html")) {
    return "AI 服务返回了异常页面，请稍后重试";
  }
  return msg;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 通过 API Manager 调用文本模型，失败时最多重试三次。 */
export async function callLlm(
  messages: ChatMessage[],
  maxTokens = 8000,
  billingTask: "text_gen" | "product_analysis" = "text_gen",
): Promise<string> {
  const systemMessage = messages.find((message) => message.role === "system");
  const parts: Array<Record<string, unknown>> = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    const content = message.content;
    if (typeof content === "string") {
      parts.push({ text: content });
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.type === "text") {
        parts.push({ text: String(record.text || "") });
        continue;
      }
      if (record.type === "image_url") {
        const imageUrl = record.image_url as Record<string, unknown> | undefined;
        const dataUrl = String(imageUrl?.url || "");
        const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    }
  }
  const systemText = typeof systemMessage?.content === "string"
    ? systemMessage.content
    : JSON.stringify(systemMessage?.content || "");

  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await generateContent({
        model: MODEL,
        task: "text_gen",
        billing_task: billingTask,
        contents: { parts },
        systemInstruction: { parts: [{ text: systemText }] },
        config: {
          temperature: 0.8,
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
        },
      });
      const content = extractText(response);
      if (content) return content;
      lastErr = "模型未返回正文";
    } catch (e) {
      lastErr = (e as Error).message || "AI 服务请求失败";
      if (/登录|积分|计费规则/.test(lastErr)) throw e;
      console.log(`[llm] 第 ${attempt} 次：${lastErr}，退避…`);
    }
    // 真正的限流恢复需要一段静默窗口，退避给够时间；加随机抖动防惊群
    const base = [5, 15, 40][attempt - 1];
    await sleep(base * (0.5 + Math.random() * 0.5) * 1000);
  }
  throw new Error(humanizeError(`调用 LLM 失败（已重试 3 次）：${lastErr}`));
}

export async function analyzeProduct(payload: AnalyzePayload): Promise<AnalysisResult> {
  // DEMO 结果也要走一遍归一化（补字段 + 扁平化出 offers），否则前端拿不到方案列表
  if (DEMO_MODE) return normalizeResult(demoGenerate(payload));

  const messages = buildMessages(payload);
  let content: string;
  try {
    // 完整的 5 套方案通常需要约 9k-12k 输出 token；推理模型还会额外
    // 占用 reasoning token，因此主分析预留更充足的总输出额度。
    content = await callLlm(messages, 16000, "product_analysis");
  } catch (e) {
    throw new Error(humanizeError((e as Error).message));
  }

  // 解析：先尝试直接解析，失败则把原文喂回 LLM 修复一次
  let result: AnalysisResult;
  try {
    result = extractJson(content);
  } catch (e) {
    if (e instanceof JSONExtractError) {
      console.log("[llm] 首轮解析失败，尝试 repair…");
      try {
        const fixed = await repairJson(e.raw);
        result = extractJson(fixed);
      } catch (e2) {
        throw new Error(humanizeError(`模型输出无法解析为 JSON（已尝试修复）：${(e2 as Error).message}`));
      }
    } else {
      throw new Error(humanizeError(`解析模型输出时出错：${(e as Error).message}`));
    }
  }

  result = normalizeResult(result);
  const rec = result as Record<string, unknown>;
  const treeOk = ((rec.audiences as AudienceNode[]) || []).some(
    (a) => ((a && a.scenarios) || []).some((s) => ((s && s.priceTiers) || []).length),
  );
  if (!treeOk || !(rec.offers as unknown[])?.length) {
    throw new Error("AI 返回的分析内容不完整（缺人群、场景或价格档位），请重新分析；系统未保存空白结果");
  }
  return result;
}

// ----------------------------------------------------------------------------
// 执行方案生成（点击「看执行方案」时针对单个方案单独生成）
//
// 为什么拆成第二次调用：一次让模型同时吐 5 套方案 ×（5-7 张主图 × 10 字段 +
// 8-12 屏详情页 × 12 字段）会轻松突破输出额度，导致 HTTP 200 但正文被截断。
// 拆到「点开哪个方案就生成哪个」，既能写满字段，等待时间也更可控。
// ----------------------------------------------------------------------------
const EXECUTION_SYSTEM_PROMPT =
  "你是一位资深的电商页面策划 + 视觉指导。你的任务是把一个「销售方案」落地成" +
  "一整套可以直接交给设计师和图片模型执行的主图与详情页结构。你必须只输出 JSON，不要输出任何解释性文字。";

const EXECUTION_USER_TEMPLATE = `# 任务：为这一套销售方案生成「执行方案」

## 产品 DNA
{product}

## 本方案（唯一要落地的方案，以下全部内容只服务于它）
{offer}

## 这一套页面必须回答的问题
主图负责「点击」，详情页负责「说服」。同一个产品的不同方案，页面逻辑必须真的不一样：
不是换人群名词、换几句文案，而是每张图的页面任务、证明方式、排列顺序都要变。

## 硬性要求（逐条自检，违反任一条都要重写）

1. 所有画面和文案必须同时参考本方案的【目标人群 + 使用场景 + 核心痛点 + 价格档位】四件事。
2. 不允许只描述图片，每一项都要解释「为什么这样设计」——尤其是适配原因、页面任务、证明方式。
3. 场景必须具体到时间、地点、人物正在做的动作；禁止「日常使用」「居家」这类空泛词。
4. 视觉必须匹配人群 + 场景 + 价格档位，禁止使用通用模板式的描述。
5. 价格档位不同，表达方式必须不同（页面里禁止出现任何具体金额）：
   - 低价：强调方便、够用、划算、容易尝试，信息密度高；
   - 平价：强调品质、体验、使用价值，信息密度适中、把价值拆开讲；
   - 高价：强调完整解决方案、材质工艺、信任与附加值，信息密度低、留白多、强调质感。
6. 所有文案遵守该方案的文案语气，禁止使用 avoid 里列出的表达。
7. 内容必须可直接指导设计和 AI 生图：写到「拍什么、怎么拍、放什么、写什么字」。
8. 本方案的价格档位是「{tier}」，valueForm 说明了这个档位靠什么撑起价值，
   主图与详情页必须把这个价值构成拍出来、证明出来。

---

## 一、主图结构（输出 5~7 张）

每张主图一个对象，必须写全下面 10 个字段：

- index：主图序号，从 "01" 开始
- type：主图类型，只能从下面选：
  产品展示 / 核心卖点 / 使用场景 / 功能演示 / 效果证明 / 参数证明 / 套装组合 / 价格价值 / 礼赠包装 / 品牌氛围
- task：页面任务，这张主图负责解决什么问题（如「让正在 XX 的人一眼觉得这说的就是我」）
- sellingPoint：这张打的核心卖点（用 sellingPointMatrix 里的功能/收益来表达）
- mainTitle：主标题，短而有力，不超过 20 字，符合该方案的主标题风格
- subTitle：副标题，1-2 句，给证据、给场景或给利益
- visualIdea：画面构思，必须写清「什么时间 + 什么地点 + 画面里有什么 + 什么机位 + 人物（或替代元素）在什么动作 + 产品在画面什么位置」
- composition：构图方式（机位、景别、主体占比、留白、是否分屏对比等）
- visualProof：视觉证明，这一张凭什么让人相信（对比 / 微距 / 时间推移 / 参照物 / 数据标注…）
- fitReason：适配原因，说明为什么这个人群 + 这个场景 + 这个价格必须用这一张、用这种方式表达

排列规则：
- 第 01 张必须解决「为什么点进来」——让人在信息流里停下。
- 之后按 核心场景 → 核心卖点 → 功能证明 → 使用收益 → 价值补充 推进。
- 但**不要固定套模板**：根据本方案的人群、痛点、价格档位自己判断该删哪张、该加哪张。
  低价档要有价格价值/性价比类；高价档要有参数证明/材质工艺类；
  需要人物代入的方案必须有使用场景类，并写清人物。
- 只有当本方案明确是「送礼场景」时，才允许使用「礼赠包装」类型；
  高价不等于送礼，**禁止把高价档自动写成礼赠表达**。

## 二、详情页结构（输出 8~12 屏）

每屏一个对象，必须写全下面 12 个字段：

- index：屏序号，从 "01" 开始
- role：页面角色，只能从下面选：
  首屏定位 / 人群代入 / 使用场景 / 用户痛点 / 解决方案 / 核心卖点 / 功能证明 / 对比证明 /
  使用效果 / 产品细节 / 材质工艺 / 参数信息 / 套装展示 / 信任背书 / 礼赠表达 / 转化收口
- task：页面任务，这一屏要说服买家相信什么、打消什么顾虑
- theme：核心主题，一句话概括这屏在讲什么
- mainTitle：主标题，不超过 20 字
- subTitle：副标题，1-2 句，必须是证据、场景或利益，不能是口号
- visualIdea：构思画面，具体到怎么拍：画面元素、机位、动作、左右/前后怎么对比
- sellingPoint：这一屏打的核心卖点
- proof：证明方式（和 sellingPointMatrix 里的 proof 对应：数据/对比/微距/过程演示/第三方/场景实证）
- benefit：用户收益，买家看完这一屏能得到什么（写结果，不写形容词）
- prevRelation：与上一屏的关系（承接什么，为什么现在讲这个）
- nextRelation：与下一屏的关系（铺垫什么，下一屏要解决什么）

排列规则（**最重要的是：不同产品、不同方案，顺序必须明显不同**）：
- 第 01 屏通常是首屏定位或强痛点钩子，先把人留住再往下讲。
- 后面按「痛点 → 代入/场景 → 方案 → 卖点 → 证明 → 使用 → 细节/材质/参数 → 套装/信任 → 转化收口」的主线走，
  但要按本方案的人群和价格带重新排。参考几种典型差异：
  - 学生/低价：场景 → 方便 → 性价比 → 功能 → 套装 → 参数 → 转化
  - 宝妈/家庭：亲子场景 → 柔软 → 安全 → 实证（如湿水不破）→ 材质 → 家庭使用 → 信任 → 转化
  - 差旅/便携：差旅场景 → 便携 → 卫生 → 使用方式 → 套装 → 参数 → 转化
  - 礼赠：礼盒定位 → 送礼场景 → 包装 → 内容物 → 实用价值 → 品质感 → 送礼理由 → 转化
  - 高价/品质：品质主张 → 材质对比 → 工艺细节 → 设计理念 → 使用体验 → 参数/服务 → 信任 → 转化
- 最后一屏必须是转化收口。
- 同一个页面角色在同一套详情页里最多出现 2 次，避免整页重复讲同一件事。
- 只有本方案明确是送礼场景时，才允许出现「礼赠表达」角色。

## 三、可供图片模型直接调用的规则

最后输出 imageGenRules 对象，共 7 条，**每条都必须来自本方案本身**（人群、场景、价格、风格），
禁止写出一套所有方案通用的规则：

- mainImage：主图生成规则（整体约束，如必须出现什么、禁止出现什么）
- detailPage：详情页生成规则（各屏之间如何保持一致）
- character：人物规则（年龄/身份/穿搭/动作/是否露脸，若不出人物说明替代方案）
- scene：场景规则（时间/地点/环境陈设/背景怎么处理）
- copy：文案规则（字数、位置、语气、禁用表达）
- composition：构图规则（机位、景别、留白、是否分屏）
- priceBand：价格带规则（本方案价位下画面应该呈现什么质感与信息密度）

## 四、同时把策略层补全

如果输入里的 copyStrategy / visualStrategy / pricePositioning / sellingPointMatrix 缺失或偏空，
请按本方案补齐（字段要求见输出格式）。已有内容就沿用并在此基础上细化。

## 输出格式（严格 JSON，不要任何 markdown 代码块、不要解释）
{
  "copyStrategy": {
    "tone": "（这个人群该用什么语气说话）",
    "keywords": ["", ""],
    "mainTitleStyle": "",
    "subTitleStyle": "",
    "avoid": ["", ""]
  },
  "visualStrategy": {
    "styleKeywords": ["", ""],
    "scene": "", "character": "", "color": "", "lighting": "",
    "composition": "", "props": ["", ""], "packageDisplay": ""
  },
  "pricePositioning": {
    "positioning": "", "expectation": "",
    "mainImageFocus": "", "detailPageProof": "", "avoid": ""
  },
  "sellingPointMatrix": [
    {"feature": "", "mechanism": "", "proof": "", "benefit": ""}
  ],
  "mainImageStructure": [
    {
      "index": "01",
      "type": "使用场景",
      "task": "",
      "sellingPoint": "",
      "mainTitle": "",
      "subTitle": "",
      "visualIdea": "",
      "composition": "",
      "visualProof": "",
      "fitReason": ""
    }
  ],
  "detailPageStructure": [
    {
      "index": "01",
      "role": "首屏定位",
      "task": "",
      "theme": "",
      "mainTitle": "",
      "subTitle": "",
      "visualIdea": "",
      "sellingPoint": "",
      "proof": "",
      "benefit": "",
      "prevRelation": "",
      "nextRelation": ""
    }
  ],
  "imageGenRules": {
    "mainImage": "", "detailPage": "", "character": "",
    "scene": "", "copy": "", "composition": "", "priceBand": ""
  }
}
`;

const MAIN_IMAGE_FIELDS = [
  "index", "type", "task", "sellingPoint", "mainTitle",
  "subTitle", "visualIdea", "composition", "visualProof", "fitReason",
] as const;
const DETAIL_PAGE_FIELDS = [
  "index", "role", "task", "theme", "mainTitle", "subTitle",
  "visualIdea", "sellingPoint", "proof", "benefit", "prevRelation", "nextRelation",
] as const;

/** 把「第几张/第几屏」补成规范的两位序号（AI 偶尔会写成中文或跳过）。 */
function fillIndexes<T extends Record<string, unknown>>(
  list: unknown,
  fields: readonly string[],
): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  let n = 0;
  for (const rawItem of list) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = { ...(rawItem as Record<string, unknown>) };
    n += 1;
    const shape: Record<string, unknown> = {};
    for (const f of fields) shape[f] = String(item[f] ?? "").trim();
    // 序号以实际位置为准，模型写错也能自愈
    shape.index = String(n).padStart(2, "0");
    out.push(shape as unknown as T);
  }
  return out;
}

export function buildExecutionMessages(payload: ExecutionPayload): ChatMessage[] {
  const offer = (payload.offer && typeof payload.offer === "object" ? payload.offer : {}) as Record<string, unknown>;
  const product = (payload.productAnalysis && typeof payload.productAnalysis === "object"
    ? payload.productAnalysis
    : {}) as Record<string, unknown>;

  // 只挑对生成页面有用的字段放进提示词，避免把历史里的图片/无关数据塞进去
  const keepOfferKeys = [
    "offerName", "positioning", "targetAudience", "scenario", "painPoint",
    "purchaseMotivation", "sellingPoints", "recommendedPrice", "pricingReason",
    "productBundle", "mainTitle", "subTitle", "mainImageCopy", "mainImageDirection",
    "priceTier", "valueForm", "purchaseReason", "copyStrategy", "visualStrategy",
    "pricePositioning", "sellingPointMatrix",
  ];
  const offerBrief: Record<string, unknown> = {};
  for (const k of keepOfferKeys) if (offer[k] !== undefined) offerBrief[k] = offer[k];

  const tier = canonicalTier(offer.priceTier ?? offer.recommendedPrice);
  offerBrief.priceTier = tier;
  offerBrief.recommendedPrice = tier;

  const keepProductKeys = [
    "name", "category", "purpose", "material", "style", "coreFunction",
    "coreSellingPoints", "problemsSolved", "emotionalValue", "functionalValue",
    "estimatedPrice", "estimatedCost", "suitablePriceRange",
    "giftable", "comboable", "packagingUpgradeable",
  ];
  const productBrief: Record<string, unknown> = {};
  for (const k of keepProductKeys) if (product[k] !== undefined) productBrief[k] = product[k];

  const text = EXECUTION_USER_TEMPLATE
    .split("{product}").join(JSON.stringify(productBrief, null, 2))
    .split("{tier}").join(tier)
    .split("{offer}").join(JSON.stringify(offerBrief, null, 2));

  return [
    { role: "system", content: EXECUTION_SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
}

/** 补全 / 清洗执行方案，保证前端一定能拿到完整结构。 */
export function normalizeExecutionPlan(plan: unknown): ExecutionPlan {
  const src = plan && typeof plan === "object" && !Array.isArray(plan)
    ? (plan as Record<string, unknown>)
    : {};

  const copy: Record<string, unknown> = {};
  const rawCopy = (src.copyStrategy && typeof src.copyStrategy === "object" ? src.copyStrategy : {}) as Record<string, unknown>;
  copy.tone = String(rawCopy.tone ?? "").trim();
  copy.keywords = Array.isArray(rawCopy.keywords) ? rawCopy.keywords.map((x) => String(x)) : [];
  copy.mainTitleStyle = String(rawCopy.mainTitleStyle ?? "").trim();
  copy.subTitleStyle = String(rawCopy.subTitleStyle ?? "").trim();
  copy.avoid = Array.isArray(rawCopy.avoid) ? rawCopy.avoid.map((x) => String(x)) : [];

  const visual: Record<string, unknown> = {};
  const rawVisual = (src.visualStrategy && typeof src.visualStrategy === "object" ? src.visualStrategy : {}) as Record<string, unknown>;
  visual.styleKeywords = Array.isArray(rawVisual.styleKeywords) ? rawVisual.styleKeywords.map((x) => String(x)) : [];
  for (const k of ["scene", "character", "color", "lighting", "composition", "packageDisplay"]) {
    visual[k] = String(rawVisual[k] ?? "").trim();
  }
  visual.props = Array.isArray(rawVisual.props) ? rawVisual.props.map((x) => String(x)) : [];

  const price: Record<string, unknown> = {};
  const rawPrice = (src.pricePositioning && typeof src.pricePositioning === "object" ? src.pricePositioning : {}) as Record<string, unknown>;
  for (const k of ["positioning", "expectation", "mainImageFocus", "detailPageProof", "avoid"]) {
    price[k] = String(rawPrice[k] ?? "").trim();
  }

  const matrix = Array.isArray(src.sellingPointMatrix)
    ? src.sellingPointMatrix.filter((x) => x && typeof x === "object").map((rawItem) => {
      const it = rawItem as Record<string, unknown>;
      return {
        feature: String(it.feature ?? "").trim(),
        mechanism: String(it.mechanism ?? "").trim(),
        proof: String(it.proof ?? "").trim(),
        benefit: String(it.benefit ?? "").trim(),
      };
    })
    : [];

  const rules: Record<string, unknown> = {};
  const rawRules = (src.imageGenRules && typeof src.imageGenRules === "object" ? src.imageGenRules : {}) as Record<string, unknown>;
  for (const k of ["mainImage", "detailPage", "character", "scene", "copy", "composition", "priceBand"]) {
    rules[k] = String(rawRules[k] ?? "").trim();
  }

  return {
    copyStrategy: copy,
    visualStrategy: visual,
    pricePositioning: price,
    sellingPointMatrix: matrix,
    mainImageStructure: fillIndexes<MainImageItem>(src.mainImageStructure, MAIN_IMAGE_FIELDS),
    detailPageStructure: fillIndexes<DetailPageItem>(src.detailPageStructure, DETAIL_PAGE_FIELDS),
    imageGenRules: rules,
  };
}

export async function generateExecutionPlan(payload: ExecutionPayload): Promise<ExecutionPlan> {
  if (DEMO_MODE) return demoExecutionPlan(payload);

  const messages = buildExecutionMessages(payload);
  let content: string;
  try {
    content = await callLlm(messages, 20000);
  } catch (e) {
    throw new Error(humanizeError((e as Error).message));
  }

  let plan: unknown;
  try {
    plan = extractJson(content);
  } catch (e) {
    if (e instanceof JSONExtractError) {
      console.log("[execution] 首轮解析失败，尝试 repair…");
      try {
        plan = extractJson(await repairJson(e.raw));
      } catch (e2) {
        throw new Error(humanizeError(`AI 输出无法解析为 JSON（已尝试修复）：${(e2 as Error).message}`));
      }
    } else {
      throw new Error(humanizeError(`解析 AI 输出时出错：${(e as Error).message}`));
    }
  }

  const normalized = normalizeExecutionPlan(plan);
  // 防空白：主图或详情页少得离谱，说明模型偷懒了，直接报错让前端提示重试
  const mainCount = normalized.mainImageStructure ? normalized.mainImageStructure.length : 0;
  const detailCount = normalized.detailPageStructure ? normalized.detailPageStructure.length : 0;
  if (mainCount < 4 || detailCount < 6) {
    throw new Error("AI 这次生成的执行方案不完整（主图或详情页数量不足），请重试");
  }
  return normalized;
}

// ----------------------------------------------------------------------------
// DEMO 模式：本地启发式生成一份结构完整、可演示的结果
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// DEMO 模式下的执行方案：没有 key 时也要能演示完整链路
//
// 关键点：不同价格层级的 DAMO 方案，主图类型序列和详情页屏序列都不一样，
// 用来演示「同一产品不同方案页面逻辑不同」这件事本身。
// ----------------------------------------------------------------------------
type Seq = { type?: string; role?: string; task: string; theme?: string; visual: string; proof?: string };

const DEMO_MAIN_SEQ: Record<string, Seq[]> = {
  引流款: [
    { type: "使用场景", task: "让目标人群在信息流里认出自己的处境", visual: "目标场景实地拍摄，人物正在使用该产品的一瞬间，产品占画面右下三分之一", proof: "真实场景实证：不加布景，用环境和动作证明它在该场景里能用" },
    { type: "核心卖点", task: "一句话说清它比别的好在哪", visual: "产品主体特写 + 卖点可视化动作，背景纯色压暗", proof: "把抽象卖点转成可拍摄的动作对比" },
    { type: "价格价值", task: "打消「会不会贵」的犹豫", visual: "价格标签与产品、组合内容物同框，元素排布整齐", proof: "价格与内容物同框呈现，让价值可被直接比对" },
    { type: "功能演示", task: "证明核心功能是真能用的", visual: "连续动作分解，展示从取用到收纳的完整过程", proof: "过程演示：一个动作连拍到结果" },
    { type: "套装组合", task: "抬高单笔成交额", visual: "套装内所有物件俯拍平铺，间距一致", proof: "内容物数量与单价拆分清单" },
    { type: "使用效果", task: "给出使用后的结果画面", visual: "使用前/使用后左右分屏，光线和机位完全一致", proof: "前后对比：只改变使用状态，其余条件不变" },
  ],
  主销款: [
    { type: "使用场景", task: "建立「这说的就是我」的代入感", visual: "目标场景半身构图，人物动作自然，产品处于画面前景清晰区", proof: "场景实证：用真实环境和人物状态建立可信度" },
    { type: "核心卖点", task: "把最值得付费的点放到最强位置", visual: "产品局部微距，突出关键结构/材质", proof: "微距细节：让卖点在物理层面被看见" },
    { type: "效果证明", task: "让买家相信效果不是文案说的", visual: "对比或时间推移画面，左右/前后同一机位", proof: "可控变量对比，只改变一个条件" },
    { type: "参数证明", task: "服务理性买家，补充硬信息", visual: "产品与常见参照物并排，附尺寸/重量标注位", proof: "可量化数据 + 日常参照物" },
    { type: "套装组合", task: "解释主销价为什么成立", visual: "产品 + 配件/赠品俯拍平铺", proof: "拆项计价，让溢价来源可见" },
    { type: "使用效果", task: "落到使用后的具体收益", visual: "使用后的人物状态与环境中景", proof: "结果画面：动作和表情呈现收益" },
  ],
  礼赠款: [
    { type: "礼赠包装", task: "第一眼就要有「拿得出手」的体面感", visual: "打开的礼盒置于画面中心，暖光侧逆打亮烫金/纹理", proof: "包装实体呈现：材质、层次、工艺都是证据" },
    { type: "使用场景", task: "明确这是送出去的东西", visual: "送礼动作瞬间，收礼人的手和礼盒在画面前景", proof: "场景实证：真实送礼动作而非摆拍" },
    { type: "核心卖点", task: "让实用性和体面感同时成立", visual: "礼盒与内容物分层排布，展示一层层打开的过程", proof: "开箱层次：每一层的存在都对应一个价值点" },
    { type: "价格价值", task: "解释礼赠溢价", visual: "礼盒、贺卡、内容物三项平铺，配清单留白", proof: "拆项计价，包装与心意占比可见" },
    { type: "品牌氛围", task: "提升整体调性支撑高价", visual: "低饱和大留白构图，产品是唯一主体", proof: "质感来自克制的色彩、光线与留白" },
    { type: "套装组合", task: "给出完整的送礼解决方案", visual: "套装全物件俯拍，边角对齐", proof: "内容物清单与规格信息" },
  ],
  高端款: [
    { type: "品牌氛围", task: "先立调性，让人愿意为品质停留", visual: "大留白构图，自然光斜射，产品为唯一主体", proof: "画面本身即证明：克制的光线、色彩与留白" },
    { type: "核心卖点", task: "把升级点说成可被感知的差异", visual: "升级材质与普通材质并排微距，打光角度一致", proof: "同条件下微距对比，差异可见" },
    { type: "参数证明", task: "给理性买家足够的硬信息", visual: "产品与测量工具同框，画面干净无杂物", proof: "可量化参数 + 精度参照" },
    { type: "产品展示", task: "完整展示形态与结构", visual: "正面平拍 + 45° 侧光，形态与边缘清晰", proof: "完整形态展示，无边角遮挡" },
    { type: "使用效果", task: "证明它在真实生活里成立", visual: "使用场景中景，人物动作从容缓慢", proof: "真实使用状态而非摆拍姿势" },
    { type: "价格价值", task: "解释为什么贵得有理由", visual: "升级项清单平铺，每项配一张小图位", proof: "升级项逐条拆解，价值可加总" },
  ],
};

const DEMO_DETAIL_SEQ: Record<string, Seq[]> = {
  引流款: [
    { role: "使用场景", task: "先把人按场景拦下来", theme: "在目标场景里用它", visual: "场景实拍中景，人物正在用，产品在前景" },
    { role: "用户痛点", task: "指出现在是怎么将就的", theme: "现在的将就", visual: "没有用它时的窘迫画面，与上一屏同场景" },
    { role: "解决方案", task: "给出直接解法", theme: "它怎么解决", visual: "产品进入同一场景的前后对比" },
    { role: "核心卖点", task: "把最值钱的点讲透", theme: "最值得买的点", visual: "卖点对应的微距或动作特写" },
    { role: "功能证明", task: "让功能不是嘴上说说", theme: "到底能不能行", visual: "功能动作的过程连拍" },
    { role: "使用效果", task: "给结果画面", theme: "用完是什么样", visual: "使用后状态中景，人物表情放松" },
    { role: "套装展示", task: "抬高客单", theme: "套装里有什么", visual: "套装物件俯拍平铺" },
    { role: "参数信息", task: "补齐理性决策信息", theme: "买前先看清规格", visual: "尺寸/材质/清洁方式三栏排版" },
    { role: "转化收口", task: "给一个今天下单的理由", theme: "现在下单的理由", visual: "套装组合 + 价格 + 保障图标组合" },
  ],
  主销款: [
    { role: "用户痛点", task: "先扎痛点再谈产品", theme: "一直没解决的问题", visual: "痛点发生的真实瞬间，人物微表情清晰" },
    { role: "使用场景", task: "让人对号入座", theme: "它就在这个场景里", visual: "目标场景实拍，产品处于使用位置" },
    { role: "解决方案", task: "说明产品扮演什么角色", theme: "它的角色", visual: "产品介入前后的同机位对比" },
    { role: "核心卖点", task: "给出付费理由", theme: "为什么值这个价", visual: "关键卖点微距特写 + 结构/材质展示" },
    { role: "功能证明", task: "用过程证明功能", theme: "功能是怎么实现的", visual: "动作分解连拍，展示关键一步" },
    { role: "对比证明", task: "用对比消除犹豫", theme: "和普通款差在哪", visual: "左右分屏，除使用状态外条件一致" },
    { role: "产品细节", task: "提前回答「做工行不行」", theme: "细节经得起看", visual: "边角、走线、接口三处微距" },
    { role: "套装展示", task: "支撑主销价", theme: "套装里有什么", visual: "产品 + 配件俯拍，配清单留白" },
    { role: "参数信息", task: "补齐规格", theme: "规格写清楚", visual: "参数表格式排版 + 参照物同框" },
    { role: "信任背书", task: "消除售后顾虑", theme: "买了也不怕", visual: "服务保障、退换说明图标化呈现" },
    { role: "转化收口", task: "把前面的理由收成一个动作", theme: "现在就买", visual: "主推 SKU + 价格 + 行动指引" },
  ],
  礼赠款: [
    { role: "首屏定位", task: "第一屏就说明这是礼物", theme: "这是一份礼物", visual: "礼盒主体占画面中心，暖光营造仪式感" },
    { role: "使用场景", task: "说明送给谁、什么场合", theme: "什么时候送", visual: "送礼的三类具体场合拼接小图" },
    { role: "礼赠表达", task: "把心意可视化", theme: "心意怎么传达", visual: "贺卡/卡片特写与礼盒同框" },
    { role: "产品细节", task: "证明不是空有包装", theme: "内容物本身也够好", visual: "内容物取出后的单独展示" },
    { role: "材质工艺", task: "支撑礼赠溢价", theme: "贵在哪", visual: "外盒材质、烫金、内衬微距" },
    { role: "使用效果", task: "证明收礼人真的用得上", theme: "收到之后", visual: "收礼人实际使用的生活化画面" },
    { role: "套装展示", task: "列出完整清单", theme: "一套送到位", visual: "礼盒全部内容物平铺" },
    { role: "信任背书", task: "降低送礼风险", theme: "送出去也放心", visual: "退换、贺卡代写、配送保障图标" },
    { role: "转化收口", task: "催促下单", theme: "别等到节前才买", visual: "节日节点 + 套装 + 价格组合" },
  ],
  高端款: [
    { role: "首屏定位", task: "把产品定位到生活态度", theme: "为什么要选好一点的", visual: "大留白空间画面，产品为唯一主体" },
    { role: "核心卖点", task: "讲最硬的那个升级点", theme: "贵在哪", visual: "升级项特写，光线强调质感" },
    { role: "材质工艺", task: "让贵的理由可被看见", theme: "材质与工艺", visual: "与普通材质同条件微距对比" },
    { role: "对比证明", task: "用数据或对比收口", theme: "差别是可以量化的", visual: "左右分屏 + 数据标注" },
    { role: "产品细节", task: "强调做工", theme: "每一处收边", visual: "走线、包边、接缝逐处微距" },
    { role: "使用效果", task: "放进真实生活", theme: "用在家里是什么样", visual: "居家空间中的使用中景" },
    { role: "参数信息", task: "给足理性信息", theme: "参数与服务", visual: "参数表 + 延保服务卡平铺" },
    { role: "信任背书", task: "支撑高客单", theme: "长期使用的底气", visual: "售后、材质承诺图标化" },
    { role: "转化收口", task: "收束到「值得」", theme: "值得多花一点", visual: "升级项清单 + 价格总结" },
  ],
};

export function demoExecutionPlan(payload: ExecutionPayload): ExecutionPlan {
  const offer = (payload.offer && typeof payload.offer === "object" ? payload.offer : {}) as Offer;
  const product = (payload.productAnalysis && typeof payload.productAnalysis === "object"
    ? payload.productAnalysis
    : {}) as Record<string, unknown>;
  // 页面档位已改成 低价 / 平价 / 高价；DEMO 的序列模板沿用旧档位名，这里做一次映射。
  const LEGACY_TIER: Record<string, string> = { 低价: "引流款", 平价: "主销款", 高价: "高端款" };
  const rawTier = String(offer.priceTier || offer.recommendedPrice || "平价");
  const tier = LEGACY_TIER[rawTier] || (/款$/.test(rawTier) ? rawTier : "主销款");
  const tierLabel = LEGACY_TIER[rawTier] ? rawTier : rawTier;
  const mainSeq = DEMO_MAIN_SEQ[tier] || DEMO_MAIN_SEQ["主销款"];
  const detailSeq = DEMO_DETAIL_SEQ[tier] || DEMO_DETAIL_SEQ["主销款"];
  const name = String(product.name || "本产品");
  const audience = String(offer.targetAudience || "目标人群");
  const scenario = String(offer.scenario || "目标场景");
  const pain = String(offer.painPoint || "使用中的老问题");
  const price = String(offer.recommendedPrice || "待定");
  const points = Array.isArray(offer.sellingPoints) ? offer.sellingPoints.map(String) : [];
  const p0 = points[0] || "核心功能";
  const p1 = points[1] || points[0] || "使用体验";
  const p2 = points[2] || points[0] || "品质感";

  const mainImageStructure: MainImageItem[] = mainSeq.map((s, i) => ({
    index: String(i + 1).padStart(2, "0"),
    type: s.type || "产品展示",
    task: `${s.task}（面向${audience}）`,
    sellingPoint: i === 0 ? p0 : i === 1 ? p1 : p2,
    mainTitle: i === 0 ? `${scenario}里，用得顺手才有用` : `${p0}`,
    subTitle: `围绕「${pain}」给出可直接验证的解法，价格 ${price}。`,
    visualIdea: `${scenario}实拍：${s.visual}；画面保留 ${name} 的明确识别位。`,
    composition: "主体置于三分线交点，占画面 1/3；机位与视线齐平或略俯 15°；背景压暗三分之二档。",
    visualProof: s.proof,
    fitReason: `${audience}在${scenario}最在意${p0}，且该价格带 ${price} 需要${tier === "礼赠款" ? "包装与仪式感" : tier === "高端款" ? "品质可被看见" : tier === "引流款" ? "性价比可见" : "价值可被拆解"}，所以这张用${s.type || "产品展示"}来承接。`,
  }));

  const detailPageStructure: DetailPageItem[] = detailSeq.map((s, i) => ({
    index: String(i + 1).padStart(2, "0"),
    role: s.role || "核心卖点",
    task: s.task,
    theme: s.theme || "",
    mainTitle: `${s.theme || p0}｜${audience.slice(0, 8)}`,
    subTitle: `针对「${pain}」，用${s.proof || plateProof(s)}给出可验证的答案。`,
    visualIdea: s.visual,
    sellingPoint: i % 3 === 0 ? p0 : i % 3 === 1 ? p1 : p2,
    proof: s.proof || plateProof(s),
    benefit: `不用再为了${pain}将就，直接得到${p0}带来的结果。`,
    prevRelation: i === 0 ? "作为首屏，先建立场景认同" : `承接上一屏的「${detailSeq[i - 1].theme || "前面那屏"}」，进一步打消顾虑`,
    nextRelation: i === detailSeq.length - 1 ? "收口到下单动作" : `为下一屏「${detailSeq[i + 1].theme || "后面那屏"}」铺垫`,
  }));

  return {
    copyStrategy: {
      tone: tier === "礼赠款" ? "精致、体面、有仪式感" : tier === "高端款" ? "克制、专业、重品质" : tier === "引流款" ? "直接、轻松、口语化" : "务实、具体、有分寸",
      keywords: [scenario, audience, p0, p1],
      mainTitleStyle: "场景词 + 结果词，不超过 20 字",
      subTitleStyle: "给证据或给场景，不写空洞口号",
      avoid: ["极致", "重新定义", "闭眼入", "适合所有人"],
    },
    visualStrategy: {
      styleKeywords: [tier === "礼赠款" ? "暖光仪式感" : tier === "高端款" ? "低饱和留白" : tier === "引流款" ? "明亮活泼" : "干净写实"],
      scene: scenario,
      character: `${audience}出镜，做真实动作`,
      color: tier === "礼赠款" ? "暖金 + 深棕" : tier === "高端款" ? "米灰 + 原木" : tier === "引流款" ? "马卡龙色系" : "低饱和中性色",
      lighting: tier === "礼赠款" ? "暖光侧逆" : "自然光 / 柔光箱，避免硬阴影",
      composition: "三分法，主体占画面 1/3，留白干净",
      props: ["日常随身物作为尺寸参照"],
      packageDisplay: tier === "礼赠款" ? "礼盒全貌 + 烫金细节" : tier === "高端款" ? "包装低调，突出材质" : "产品本体为主，包装辅以收纳袋",
    },
    pricePositioning: {
      positioning: `${tierLabel}档｜${String(offer.valueForm || offer.positioning || "价值构成待补充")}`,
      expectation: tier === "引流款" ? "方便、够用、划算、敢尝试" : tier === "高端款" ? "品质、信任、长期价值" : tier === "礼赠款" ? "包装体面、场景合适、送出不尴尬" : "体验升级、使用价值清晰",
      mainImageFocus: tier === "礼赠款" ? "包装体面与送礼仪式" : tier === "高端款" ? "材质工艺与整体质感" : tier === "引流款" ? "价格与够用" : "卖点可视化与套装价值",
      detailPageProof: `${p0}的可验证证据、以及 ${price} 为什么成立`,
      avoid: tier === "高端款" ? "廉价促销感表达" : tier === "礼赠款" ? "过度自夸与浮夸口号" : "绝对化与医疗化表达",
    },
    sellingPointMatrix: [p0, p1, p2].map((p, i) => ({
      feature: p,
      mechanism: i === 0 ? "结构与材料上的针对性设计" : i === 1 ? "工艺与做工上的取舍" : "整体方案层面的补齐",
      proof: `${scenario}下可拍摄的对比/微距/过程演示`,
      benefit: `直接缓解「${pain}」，得到可感知的结果`,
    })),
    mainImageStructure,
    detailPageStructure,
    imageGenRules: {
      mainImage: `所有主图统一来自${audience}的${scenario}，色调与光线保持一致；每张必须有明确的画面焦点和${p0}的视觉证据。`,
      detailPage: "各屏之间保持同一套配色、字体层级和留白规则，避免前后像两个产品。",
      character: `${audience}，做真实动作，避免过度摆拍与网红脸。`,
      scene: `${scenario}，时间地点明确，背景陈设服务于叙事，不抢主体。`,
      copy: "主标题不超过 20 字、位于画面上方；副标题一行；禁用 avoid 列表中的表达。",
      composition: "三分法构图，主体占 1/3；对比类画面用左右等分或前后分屏。",
      priceBand: `${tierLabel}档：${tier === "引流款" ? "信息密度高、强调划算与够用" : tier === "高端款" ? "信息密度低、强调质感与工艺" : tier === "礼赠款" ? "强调包装与仪式感" : "信息密度适中、强调价值拆解"}。`,
    },
  };
}

function plateProof(s: Seq): string {
  return `${s.visual}；并用可对比、可微距或过程演示的方式呈现`;
}

/**
 * DEMO 数据结构：人群 → 场景 → 价格档位（低价 / 平价 / 高价），不出现具体金额。
 * 构造小工具：只需要写「这个档位凭什么成立」，公共字段自动补齐。
 */
type TierSeed = {
  positioning: string;
  motivation: string;
  points: string[];
  valueForm: string;
  reason: string;
  bundle: string[];
  title: string;
  sub: string;
  copy: string;
  visual: string;
  whyPrice: string;
  when: string;
  why: string;
};

function mkTier(tier: string, seed: TierSeed): PriceTierPlan {
  return {
    tier,
    positioning: seed.positioning,
    painPoint: "",
    purchaseMotivation: seed.motivation,
    sellingPoints: seed.points,
    valueForm: seed.valueForm,
    pricingReason: seed.reason,
    productBundle: seed.bundle,
    mainTitle: seed.title,
    subTitle: seed.sub,
    mainImageCopy: seed.copy,
    mainImageDirection: seed.visual,
    videoIdea:
      "0-3秒：抛出该场景的具体痛点；3-7秒：人物处境与为什么将就不了；" +
      "7-12秒：产品出现并演示怎么用；12-18秒：把这个档位多出来的价值拍清楚；" +
      "18-24秒：组合/包装/服务一次展示；24-30秒：回到人物状态变化，给出下单理由。",
    purchaseReason: {
      who: seed.positioning.includes("送") ? "要给家人买点实用东西的人" : "处在该场景里的人",
      when: seed.when,
      why: seed.why,
      whyPrice: seed.whyPrice,
    },
  };
}

export function demoGenerate(payload: AnalyzePayload): AnalysisResult {
  // DEMO 模式不读图，名称用占位名；真实模式下由模型从图片识别
  const name = "示例产品（DEMO）";
  void payload;

  const audiences: AudienceNode[] = [
    {
      name: "25-35岁工位午休、午睡后脖子发僵的办公室白领",
      ageRange: "25-35岁",
      identity: "一线/新一线城市公司职员",
      usageHabit: "午休只有 30-40 分钟，习惯趴桌或靠椅背小憩",
      painPoint: "趴桌睡醒脖子酸、肩膀僵，下午开会没状态",
      spendingPower: "月可支配 3000-6000，愿意为舒适度花钱",
      whyBuy: "想在有限午休时间里睡得舒服一点，下午状态好一点",
      scenarios: [
        {
          name: "办公室工位午休",
          description: "午休 30 分钟，直接在工位上趴着或靠着睡",
          painPoint: "桌面硬、空间小，趴久了脖子僵",
          productSolves: "给头颈一个稳定的支撑，用完能马上收走",
          userCares: "支撑感、不占桌面、好收纳",
          mainImageDirection: "办公桌午后自然光，产品放在画面右侧黄金分割点，一只手正在收起产品",
          priceTiers: [
            mkTier("低价", {
              positioning: `${name}·够用基础款`,
              motivation: "先买一个试试，好用再说",
              points: ["基础支撑够用", "小巧不占桌面", "颜色低调不突兀"],
              valueForm: "单品（一个基础规格，简约袋装）",
              reason: "只解决「趴桌不舒服」这一件事，去掉一切附加内容，让第一次尝试的人没有决策负担。",
              bundle: ["单品"],
              title: "午休先试试，够用就行",
              sub: "一个基础支撑，桌面随手一放",
              copy: "先解决趴着睡这件事",
              visual: "办公桌俯拍，产品单独入镜，旁边只放一支笔做尺寸参照",
              whyPrice: "只是想低成本试一次，够用就下单",
              when: "刚入职或午休一直将就，想花最少的钱先改善",
              why: "基础支撑已经能缓解趴桌的不舒服",
            }),
            mkTier("平价", {
              positioning: `${name}·工位午休套装`,
              motivation: "想一次配齐，到手就能用",
              points: ["贴合颈曲的支撑", "可拆洗外套", "收纳袋一收就走", "米白极简不突兀"],
              valueForm: "产品 + 防尘收纳袋 + 可拆洗外套（比低一档多：外套可拆洗、多了收纳袋）",
              reason: "在基础支撑之外补上「卫生」和「收纳」两件办公室真正在意的事，价值构成清楚了，价格自然上一档。",
              bundle: ["产品+收纳袋", "产品+可拆洗外套"],
              title: "午休 30 分钟，脖子也该歇会儿",
              sub: "工位就能用的轻便支撑，用完一收不占地",
              copy: "午休 30 分钟，脖子也该歇会儿",
              visual: "办公桌场景，女性趴在产品上午休，产品占画面右侧三分之一，米白+浅木色调",
              whyPrice: "多出来的收纳袋和可拆洗外套，正好补上午休场景的两个顾虑",
              when: "已经确认自己需要，想把卫生和收纳一起解决",
              why: "支撑、卫生、收纳一次到位，不用再另外买",
            }),
          ],
        },
        {
          name: "加班后靠在椅背上的临时小憩",
          description: "晚上加班间隙，靠在椅背上闭眼十几分钟",
          painPoint: "椅背硬，脖子悬空，越歇越累",
          productSolves: "补上腰部与颈部的空隙，短时间也能放松",
          userCares: "贴合椅背、翻身不跑位、好打理",
          mainImageDirection: "夜间办公室，显示器还亮着，人物靠在椅背上闭眼，产品卡在颈后",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·加班小憩款`,
              motivation: "加班是常态，想让自己歇得踏实一点",
              points: ["贴合椅背不易滑", "外套可拆洗", "轻便可带回家"],
              valueForm: "产品 + 可拆洗外套",
              reason: "比基础款多一层可拆洗外套，长时间贴脸使用也不担心卫生，是这个场景真正需要的东西。",
              bundle: ["产品+可拆洗外套"],
              title: "加班间隙，靠一会儿也是休息",
              sub: "贴合椅背，翻身也不容易跑位",
              copy: "能歇一会儿，就别硬扛",
              visual: "夜间办公室侧拍，人物靠椅背闭眼，显示器微光打在脸上，产品卡在颈后",
              whyPrice: "可拆洗外套解决了贴脸使用的卫生顾虑，值得多这一档",
              when: "经常加班到深夜，需要短暂闭眼恢复",
              why: "椅背与颈部的空隙被填上了，短时间也能放松",
            }),
            mkTier("高价", {
              positioning: `${name}·升级材质 + 服务版`,
              motivation: "每天都要用，想一步到位买个更好的",
              points: ["升级慢回弹内芯", "外套可拆洗且备一件替换", "做工细、边角收得住", "含一年质保服务卡"],
              valueForm: "升级材质 + 备用外套 + 质保服务卡 + 硬质收纳盒（比低一档多：材质升级、备用外套、服务）",
              reason: "材质、备用件、售后三件事一起升级，长期使用的人算下来反而更省事，价格锚在品质与服务上。",
              bundle: ["升级材质单品+备用外套", "材质升级+服务卡套装"],
              title: "每天都要用的，值得选好一点",
              sub: "材质、备用外套、质保都配齐",
              copy: "用得久的东西，值得多花一点心思挑",
              visual: "浅灰背景静物台，产品边角微距，旁边放一把尺做精度参照，侧光打出缝线阴影",
              whyPrice: "每天使用，材质升级 + 备用外套 + 质保摊到每天并不贵",
              when: "已经用过基础款，确认高频使用想升级",
              why: "材质、做工、售后都比基础款稳，长期用更安心",
            }),
          ],
        },
      ],
    },
    {
      name: "18-24岁宿舍空间小、爱拍照分享的大学生",
      ageRange: "18-24岁",
      identity: "在校大学生",
      usageHabit: "宿舍上床下桌，热衷社交分享，喜欢凑单",
      painPoint: "宿舍杂乱、东西丑，便宜的又怕踩雷",
      spendingPower: "生活费 1500-2500，价格敏感",
      whyBuy: "想要便宜、好看、还能晒的小物",
      scenarios: [
        {
          name: "宿舍午睡",
          description: "下午没课，在宿舍床上或书桌前眯一会儿",
          painPoint: "宿舍桌子硬、床铺乱，睡觉姿势别扭",
          productSolves: "小巧、好收纳、颜值在线",
          userCares: "颜值、占地小、好拍照",
          mainImageDirection: "宿舍床桌场景，床帘透进午后阳光，产品放在床沿，马卡龙配色",
          priceTiers: [
            mkTier("低价", {
              positioning: `${name}·宿舍基础款`,
              motivation: "预算有限，先买个能用又好看的",
              points: ["马卡龙配色", "小巧不占地", "价格友好"],
              valueForm: "单品（一个颜色，简易包装）",
              reason: "只保留外观和基本功能，让预算有限的人也能直接下单。",
              bundle: ["单品"],
              title: "便宜好看，先来一个试试",
              sub: "小床位也放得下",
              copy: "好看又不贵，先试试",
              visual: "宿舍书桌俯拍，产品单独入镜，四色卡片平铺在旁边",
              whyPrice: "生活费有限，几十块的东西不犹豫",
              when: "刚开学布置宿舍、想添个小东西",
              why: "便宜、好看、能用，够了",
            }),
            mkTier("平价", {
              positioning: `${name}·宿舍 2 件套`,
              motivation: "和舍友一起买更划算，也能换着用",
              points: ["双色可选可撞色", "多一件可替换", "折算下来更便宜", "拍照更出片"],
              valueForm: "2 件套（同色/撞色）+ 收纳袋（比低一档多：数量翻倍、多了收纳袋）",
              reason: "数量从一件变两件，还能和舍友拼单，折算下来单件更低，是这个人群最容易接受的上台阶梯。",
              bundle: ["2件套（同色）", "2件套（撞色）"],
              title: "和舍友拼一套，更划算",
              sub: "一件替换一件在用，收纳袋一起配",
              copy: "一人一个，或者一件替换着用",
              visual: "宿舍床沿俯拍，两件产品并排，颜色撞色，旁边放着手机显示拍照界面",
              whyPrice: "两件折算下来比单买便宜，还能和舍友平摊",
              when: "和舍友一起布置宿舍时",
              why: "一件替换一件在用，更卫生也更划算",
            }),
          ],
        },
        {
          name: "图书馆/自习室的趴桌小憩",
          description: "复习间隙在自习室桌上趴十几分钟",
          painPoint: "桌面硬、公共场合不方便铺开大件",
          productSolves: "体积小、拿出来不尴尬、收得快",
          userCares: "便携、低调、收得快",
          mainImageDirection: "图书馆桌面，书本与保温杯旁放着折叠后的产品，光线安静",
          priceTiers: [
            mkTier("低价", {
              positioning: `${name}·便携单品`,
              motivation: "想在图书馆也能眯一会儿",
              points: ["折叠后巴掌大", "塞进书包侧袋", "拿出来不张扬"],
              valueForm: "单品（折叠款，简易袋装）",
              reason: "只为「便携」这一件事付费，其余从简。",
              bundle: ["单品"],
              title: "塞进书包，图书馆也能眯一会儿",
              sub: "折叠后巴掌大小",
              copy: "小到能塞进侧袋",
              visual: "图书馆桌面侧拍，产品折叠后放在书与保温杯之间，背景虚化",
              whyPrice: "只买便携这件事，越轻负担越好",
              when: "备考期间需要在自习室短暂休息",
              why: "体积小、收得快，公共场合不尴尬",
            }),
            mkTier("平价", {
              positioning: `${name}·便携 + 收纳套装`,
              motivation: "经常在宿舍和图书馆之间来回跑",
              points: ["折叠后不散形", "独立收纳袋防灰", "面料耐脏好擦"],
              valueForm: "产品 + 防尘收纳袋（比低一档多：收纳袋、耐脏处理）",
              reason: "加上防尘袋和耐脏处理，解决了「天天带回宿舍」这件事的卫生顾虑。",
              bundle: ["产品+收纳袋"],
              title: "天天带出门，也该有个袋子",
              sub: "收纳袋一装，书包里不蹭灰",
              copy: "一收就走，到了就能用",
              visual: "书包侧袋特写，一只手把折好的产品塞进去，旁边是课本",
              whyPrice: "每天来回带，防尘袋和耐脏面料省掉了清洗麻烦",
              when: "每天在宿舍与图书馆之间往返",
              why: "收纳和耐脏处理解决了随身携带的顾虑",
            }),
          ],
        },
      ],
    },
    {
      name: "30-45岁想给父母买点实用东西的异地上班族",
      ageRange: "30-45岁",
      identity: "已婚/有父母的职场人",
      usageHabit: "逢年过节给家里买东西，平时只能线上表达关心",
      painPoint: "想表达关心但不知道买什么，怕显得敷衍",
      spendingPower: "月可支配 8000+，为亲情愿意加价",
      whyBuy: "把实用的东西包装成体面的心意",
      scenarios: [
        {
          name: "节日礼赠",
          description: "生日/节庆时作为礼物寄回家",
          painPoint: "普通包装拿不出手，保健品又怕踩雷",
          productSolves: "礼盒 + 贺卡把实用品变成心意",
          userCares: "体面、有心意、父母真的用得上",
          mainImageDirection: "打开的礼盒俯拍，暖光，盒盖斜靠在左后，贺卡压在丝带下",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·简装礼盒版`,
              motivation: "想让它至少像个礼物",
              points: ["简约礼盒包装", "实用不踩雷", "尺寸合适好收纳"],
              valueForm: "产品 + 礼盒（比单品多：外盒与内衬）",
              reason: "只增加一层像样的外包装，让「送人」这件事成立，不堆砌用不上的东西。",
              bundle: ["产品+礼盒"],
              title: "送爸妈，实用又不显敷衍",
              sub: "礼盒装好，拆开就是能用的东西",
              copy: "打开就是一份心意",
              visual: "餐桌上俯拍，礼盒半开，暖光，旁边一束干花",
              whyPrice: "只是多了一层包装，为「送得体面」付的钱不多",
              when: "父母生日、节庆前挑礼物",
              why: "实用 + 像样的包装，送礼不尴尬",
            }),
            mkTier("高价", {
              positioning: `${name}·体面礼赠套装`,
              motivation: "一年就送这一次，想让它更像样",
              points: ["硬质烫金礼盒", "手写贺卡可代写", "升级材质", "含质保服务卡"],
              valueForm: "礼盒 + 贺卡 + 代写服务 + 材质升级 + 质保卡（比低一档多：贺卡、代写、材质、服务）",
              reason: "包装、心意表达（贺卡代写）、材质、售后四层一起加，送礼人省事、收礼人安心，这个档位才成立。",
              bundle: ["产品+礼盒+贺卡", "礼赠套装（含代写）"],
              title: "说不出口的话，写在卡片里",
              sub: "礼盒、贺卡、材质、质保一次配齐",
              copy: "打开一层，还有一层",
              visual: "深色木桌，礼盒半开，贺卡特写与钢笔并排，侧逆光让烫金反光",
              whyPrice: "一年一次的场合，包装、贺卡、材质、售后加起来值得",
              when: "春节、父母生日等重要节点的送礼",
              why: "体面、有心意，父母收到也真的用得上",
            }),
          ],
        },
        {
          name: "父母在家的日常午睡",
          description: "父母午饭后躺沙发或床上休息",
          painPoint: "随便垫个枕头，醒来脖子不舒服",
          productSolves: "给颈部稳定支撑，外套好清洗",
          userCares: "软硬适中、好清洗、耐用",
          mainImageDirection: "客厅沙发午后自然光，父亲躺在沙发上小憩，产品垫在颈下",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·家用可拆洗款`,
              motivation: "给父母买，至少要好打理",
              points: ["外套可拆洗", "软硬适中", "尺寸比便携款大一号"],
              valueForm: "产品 + 可拆洗外套（家用规格）",
              reason: "父母长期使用，能不能洗是第一位，这一档把「可拆洗」和「家用尺寸」补上。",
              bundle: ["产品+可拆洗外套"],
              title: "给爸妈买的，好洗最重要",
              sub: "外套能拆下来洗，尺寸按家用做",
              copy: "脏了直接拆下来洗",
              visual: "客厅沙发中景，产品外套被拆下的动作定格，旁边放着洗衣袋",
              whyPrice: "可拆洗这件事对长期使用的父母最有价值",
              when: "给家里添置日常用品时",
              why: "好打理、软硬适中，父母愿意天天用",
            }),
            mkTier("高价", {
              positioning: `${name}·家用升级套装`,
              motivation: "给父母用的，想买好一点的",
              points: ["升级内芯支撑更久", "备用外套一件", "做工与边角更细", "含质保服务卡"],
              valueForm: "升级材质 + 备用外套 + 质保卡（比低一档多：材质升级、备用外套、售后）",
              reason: "材质更耐用、备用外套免去清洗等待、质保让子女放心，这三个正是「买给父母」时最在意的。",
              bundle: ["升级材质+备用外套", "家用升级套装"],
              title: "给父母用的，选耐用一点的",
              sub: "升级内芯 + 备用外套 + 质保卡",
              copy: "用得久一点，也放心一点",
              visual: "客厅沙发，产品边角微距，旁边是备用外套叠放整齐，自然光",
              whyPrice: "给父母买，耐用和售后比便宜更重要",
              when: "想给父母换掉用了很久的旧物",
              why: "材质耐用、有备用品、有质保，长期更省心",
            }),
          ],
        },
      ],
    },
    {
      name: "经常出差、对便携和卫生挑剔的商务人群",
      ageRange: "28-42岁",
      identity: "频繁出差的销售/顾问/工程师",
      usageHabit: "高铁、飞机、酒店之间切换，行李越轻越好",
      painPoint: "路上睡不好，带的东西占地方还容易脏",
      spendingPower: "月可支配 10000+，愿为省事付费",
      whyBuy: "少带一件是一件，但路上该有的舒适不能省",
      scenarios: [
        {
          name: "高铁/飞机上补觉",
          description: "两三个小时的行程里靠着座椅睡一觉",
          painPoint: "座椅硬、脖子悬空，公共座椅还怕不卫生",
          productSolves: "随身带着不占地方，还能保持干净",
          userCares: "便携、卫生、拿出来不麻烦",
          mainImageDirection: "高铁小桌板侧拍，窗外风景虚化，产品折叠后放在小桌板一角",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·差旅便携款`,
              motivation: "出差想睡得舒服点，但行李要轻",
              points: ["折叠后护照大小", "带独立防尘袋", "面料耐脏好擦"],
              valueForm: "产品 + 防尘收纳袋（比单品多：收纳袋与耐脏处理）",
              reason: "收纳袋和耐脏面料直接对应「路上怕脏、行李怕占地方」两个差旅痛点。",
              bundle: ["产品+便携收纳袋"],
              title: "塞进包里，路上也能睡一会儿",
              sub: "折叠后护照大小，独立防尘袋",
              copy: "一收就走，到了就能用",
              visual: "行李箱俯拍，产品与护照并排放在侧袋，箱内衣物码放整齐",
              whyPrice: "收纳袋与耐脏处理正好解决差旅的两个顾虑",
              when: "准备出差行程、收拾行李时",
              why: "便携、卫生，路上真的能用",
            }),
            mkTier("高价", {
              positioning: `${name}·差旅升级套装`,
              motivation: "一年飞几十次，想要一个更省心的",
              points: ["升级面料更耐造", "硬质收纳盒不变形", "含清洁湿巾与质保卡", "支撑更稳不塌"],
              valueForm: "升级面料 + 硬质收纳盒 + 清洁湿巾 + 质保卡（比低一档多：材质、收纳盒、清洁与售后）",
              reason: "高频差旅最怕「用几次就塌、脏了没法处理」，这一档把材质、收纳、清洁、售后一次补齐。",
              bundle: ["升级面料+收纳盒", "差旅升级套装（含清洁湿巾）"],
              title: "一年飞几十次，值得配个好的",
              sub: "升级面料 + 硬壳收纳 + 清洁与质保",
              copy: "路上用的东西，得经得起折腾",
              visual: "深色台面微距，水珠停在面料表面，旁边是纸巾擦拭的动作定格",
              whyPrice: "高频使用，材质耐用、好打理、有售后摊到每次出差并不贵",
              when: "高频出差、已经用过便携款想升级",
              why: "耐造、好打理、有质保，长期出差更省事",
            }),
          ],
        },
        {
          name: "酒店午休/倒时差的短睡",
          description: "到酒店后先躺一会儿，或半夜醒来再睡",
          painPoint: "酒店枕头高低不合适，脖子别扭",
          productSolves: "自带一个熟悉的支撑，换酒店也不影响",
          userCares: "熟悉感、好收纳、不影响行李",
          mainImageDirection: "酒店床头灯暖光，产品放在枕头旁，行李箱半开在床边",
          priceTiers: [
            mkTier("低价", {
              positioning: `${name}·备用单品`,
              motivation: "多带一个备用，不占地方就行",
              points: ["轻便可压", "塞进行李箱夹层", "简单好用"],
              valueForm: "单品（可压缩基础款）",
              reason: "定位是「备用」，只在酒店用，不需要额外附件。",
              bundle: ["单品"],
              title: "行李箱里多带一个，也不占地方",
              sub: "可压缩，塞夹层就行",
              copy: "备一个，到了酒店就能用",
              visual: "酒店床边，产品压在行李箱夹层里，只露出一角，床头灯暖光",
              whyPrice: "只是备用品，越轻越便宜越好",
              when: "偶尔出差、只需要一个备用",
              why: "酒店枕头不合适时有个熟悉的替代",
            }),
            mkTier("平价", {
              positioning: `${name}·酒店午休套装`,
              motivation: "经常换酒店，想睡得稳定一点",
              points: ["支撑稳定不塌", "带收纳袋保持干净", "适配不同枕头高度"],
              valueForm: "产品 + 收纳袋（比低一档多：收纳袋与支撑升级）",
              reason: "从「备用」升级到「常用」，收纳与支撑两件事都要跟上。",
              bundle: ["产品+收纳袋"],
              title: "换酒店也不影响睡个好觉",
              sub: "支撑稳定，收纳袋保持干净",
              copy: "到哪儿都能睡得习惯",
              visual: "酒店床头中景，产品垫在颈下，床头灯暖光，窗外天色渐暗",
              whyPrice: "常用而非备用，支撑与卫生都值得多这一档",
              when: "经常换酒店、对睡眠稳定性有要求",
              why: "自带熟悉支撑，换酒店也能睡得稳",
            }),
          ],
        },
      ],
    },
    {
      name: "产后/哺乳期夜里频繁起身的宝妈",
      ageRange: "26-36岁",
      identity: "家有 0-1 岁宝宝的全职或休假中妈妈",
      usageHabit: "夜里起身喂奶、哄睡，白天趁娃睡了补一觉",
      painPoint: "睡眠被切得很碎，躺下那几分钟特别珍贵",
      spendingPower: "家庭月收入 8000-20000，母婴类支出优先级高",
      whyBuy: "想在宝宝睡着的空档里，让自己也真正歇几分钟",
      scenarios: [
        {
          name: "夜里喂奶后在沙发上眯一会儿",
          description: "凌晨喂完奶，抱着娃在沙发上不敢动，顺手眯几分钟",
          painPoint: "沙发靠背角度不对，脖子悬着，一醒更累",
          productSolves: "随手垫上就能撑住头颈，抱着娃也能用",
          userCares: "随手能拿、好清洗、不占沙发",
          mainImageDirection: "深夜客厅，只开一盏小夜灯，宝妈侧靠在沙发上，产品垫在颈后",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·母婴安心款`,
              motivation: "带娃已经够累了，能舒服一点是一点",
              points: ["亲肤面料可整洗", "支撑不塌", "放沙发扶手边随手拿"],
              valueForm: "产品 + 可拆洗外套（比单品多：整洗与替换外套）",
              reason: "母婴场景第一位是「好清洗」，多一件可换洗外套正好对应这个顾虑。",
              bundle: ["产品+可拆洗外套"],
              title: "夜里那几分钟，也让自己歇一歇",
              sub: "亲肤可整洗，随手垫上就能靠",
              copy: "带娃的夜里，也要照顾一下自己",
              visual: "深夜客厅，小夜灯暖光，宝妈侧靠沙发，产品垫在颈后，宝宝睡在一旁",
              whyPrice: "好清洗、亲肤这两点在带娃场景里值这个档",
              when: "产后休养期、夜里频繁起身",
              why: "随手能靠、脏了能洗，碎片睡眠里真能用上",
            }),
          ],
        },
      ],
    },
    {
      name: "每天通勤 1 小时以上、地铁里补觉的上班族",
      ageRange: "24-38岁",
      identity: "跨城通勤的打工人",
      usageHabit: "早高峰地铁/大巴上补觉，到公司还要立刻进入状态",
      painPoint: "车上睡一路，下车脖子僵、形象也垮",
      spendingPower: "月可支配 4000-8000，通勤装备愿意投入",
      whyBuy: "想把通勤这段时间睡得值一点，下车不难受",
      scenarios: [
        {
          name: "早高峰地铁/大巴上补觉",
          description: "通勤 40-70 分钟，靠窗或靠扶手眯一段",
          painPoint: "车晃动、头部没支撑，睡醒更累",
          productSolves: "给头颈一个固定支点，车晃也不容易滑",
          userCares: "防滑、体积小、到站一收就走",
          mainImageDirection: "地铁车厢内，窗外光线流动，人物靠窗闭眼，产品卡在颈侧",
          priceTiers: [
            mkTier("低价", {
              positioning: `${name}·通勤基础款`,
              motivation: "通勤天天要用，先来个便宜能用的",
              points: ["体积小好带", "卡得住不打滑", "到站一收就走"],
              valueForm: "单品（基础规格）",
              reason: "通勤是高频但单价敏感的场景，去掉附件，只留最核心的支撑与便携。",
              bundle: ["单品"],
              title: "通勤那一觉，别再硬扛",
              sub: "卡得住，到站一收就走",
              copy: "路上睡一会儿，下车还是精神的",
              visual: "地铁车厢窗边侧拍，产品卡在颈侧，窗外光线流动虚化",
              whyPrice: "每天都要带，够用就行，别增加负担",
              when: "通勤时间长、车上习惯补觉",
              why: "便宜、便携、能撑住，通勤够用了",
            }),
          ],
        },
      ],
    },
    {
      name: "给同事/客户挑小礼的行政与 HR",
      ageRange: "25-40岁",
      identity: "公司行政、HR、团队负责人",
      usageHabit: "节日、入职、团建时批量采购伴手礼",
      painPoint: "预算有限但要体面，怕买的东西没人用",
      spendingPower: "单次预算按人头算，看重单价与起订量",
      whyBuy: "要一个大家拿得出手、也真的会用的东西",
      scenarios: [
        {
          name: "新人入职/节日批量伴手礼",
          description: "一次性采购几十份，发给新人或客户",
          painPoint: "便宜的显得敷衍，贵的超预算，还怕发下去没人用",
          productSolves: "人人用得上，包装体面，成本可控",
          userCares: "单价、包装体面度、通用性",
          mainImageDirection: "会议桌上整齐码放的礼盒，旁边是贺卡与丝带，俯拍",
          priceTiers: [
            mkTier("高价", {
              positioning: `${name}·礼盒批量装`,
              motivation: "发给大家的东西，体面是第一位",
              points: ["礼盒 + 贺卡成套", "可定制公司标识", "整箱包装不易压坏"],
              valueForm: "礼盒 + 贺卡 + 定制标识 + 整箱包装（比单品多：包装、定制、装箱）",
              reason: "批量采购买的不是产品本身，而是「发出去的体面」，价值全在包装与定制上。",
              bundle: ["礼盒装+贺卡", "定制标识整箱装"],
              title: "发给新人的第一份礼，要体面也要好用",
              sub: "礼盒 + 贺卡 + 可定制标识",
              copy: "拿得出手，也真的用得上",
              visual: "会议桌俯拍，礼盒成排码放，贺卡与丝带在一旁，冷白光",
              whyPrice: "包装与定制带来的体面，是这个场景真正付钱的部分",
              when: "新人入职、节日福利、客户回访",
              why: "体面、通用、成本可控，发下去不会被闲置",
            }),
          ],
        },
      ],
    },
    {
      name: "退休在家、午睡与看电视时间长的长辈",
      ageRange: "55-75岁",
      identity: "退休职工、帮子女带娃的长辈",
      usageHabit: "午睡时间长，下午常在沙发上看电视打盹",
      painPoint: "沙发太软，躺久了腰颈都不舒服",
      spendingPower: "退休金 3000-6000，重实用、不追品牌",
      whyBuy: "想让每天那几个小时躺得舒服些",
      scenarios: [
        {
          name: "午后沙发上看电视打盹",
          description: "下午两三点靠在沙发上看电视，看着看着睡着",
          painPoint: "沙发软塌，头颈没有支撑，醒后发僵",
          productSolves: "垫在颈后或腰后，沙发也能躺得稳",
          userCares: "好清洗、支撑够、样子不花哨",
          mainImageDirection: "客厅午后阳光，长辈靠在沙发上打盹，产品垫在颈后，茶几上有茶杯",
          priceTiers: [
            mkTier("平价", {
              positioning: `${name}·居家长辈款`,
              motivation: "每天都要靠，买个实在的",
              points: ["支撑厚实", "外套可拆洗", "配色素净不花哨"],
              valueForm: "产品 + 可拆洗外套（比单品多：厚实支撑与可拆洗）",
              reason: "长辈在意的是「实在」——支撑够、能洗、不花哨，这三件都补上才成立。",
              bundle: ["产品+可拆洗外套"],
              title: "下午靠一会儿，脖子也该有个支撑",
              sub: "厚实支撑，外套可拆洗",
              copy: "每天都要靠的，选个实在的",
              visual: "客厅午后，长辈靠沙发打盹，产品垫颈后，茶几上一杯茶，暖光",
              whyPrice: "支撑与好打理是每天都要用到的，值这个档",
              when: "居家午睡、看电视打盹",
              why: "厚实、好洗、素净，长辈用着顺手",
            }),
          ],
        },
      ],
    },
  ];

  return {
    productAnalysis: {
      name,
      category: "（示例类目）生活用品",
      purpose: "（示例用途）午休/短时休息时给头颈支撑",
      material: "（示例材质）亲肤面料 + 慢回弹内芯",
      style: "（示例风格）简约实用",
      coreFunction: "（示例功能）提供头颈支撑并可压缩收纳",
      coreSellingPoints: ["支撑稳定", "可压缩收纳", "外套可拆洗"],
      problemsSolved: ["趴桌睡醒脖子僵", "外出携带占地方", "长期使用不好打理"],
      emotionalValue: "被照顾的安心感",
      functionalValue: "在短时休息里给头颈一个稳定的支撑",
      suitablePriceRange: "（按档位区分：低价 / 平价 / 高价）",
      estimatedPrice: "79-129元（AI 推断，非商家提供）",
      estimatedCost: "约 30-45元（按同类目常见成本率推算）",
      priceBasis: "同类目产品在主流平台的主力成交价集中在这个区间，材质与工艺支持一定溢价。",
      giftable: true,
      comboable: true,
      packagingUpgradeable: true,
      _demo: true,
    },
    audiences,
  };
}
