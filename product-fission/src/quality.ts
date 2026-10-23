// 商品裂变结果质量检查
//
// 只做确定性、低成本检查：禁词/合规风险、泛化人群场景、标题可用性、
// purchaseReason 完整度、方案之间的重复度。检查结果附加到 result，不改变原始生成内容。
import type { Offer, QualityIssue, QualityReport, AnalysisResult } from "./types";
import customRules from "../rules/quality_rules.json";

export interface QualityRules {
  fail_terms: string[];
  warning_terms: string[];
  vague_audience_terms: string[];
  vague_scene_terms: string[];
  required_purchase_reason: string[];
  title_min_len: number;
  title_max_len: number;
  [key: string]: unknown;
}

const DEFAULT_RULES: QualityRules = {
  fail_terms: [
    "最便宜", "全网最低", "国家级", "顶级", "第一品牌", "销量第一",
    "100%有效", "永久", "根治", "治愈", "治疗", "疗效", "药到病除",
    "加微信", "私信下单", "站外联系", "VX", "v信",
  ],
  warning_terms: [
    "极致", "重新定义", "赋能", "黑科技", "神器", "闭眼入", "必买",
    "适合所有人", "大众人群", "通用场景", "日常使用", "居家使用",
  ],
  vague_audience_terms: ["所有人", "大众", "通用", "用户群体", "男女老少"],
  vague_scene_terms: ["日常使用", "居家", "通用场景", "各种场景", "随时随地"],
  required_purchase_reason: ["who", "when", "why", "whyPrice"],
  title_min_len: 8,
  title_max_len: 60,
};

export function loadRules(): QualityRules {
  const rules: QualityRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  const custom: unknown = customRules;
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return rules;
  for (const [key, value] of Object.entries(custom as Record<string, unknown>)) {
    if (Array.isArray(value) && Array.isArray((rules as Record<string, unknown>)[key])) {
      const merged = [...((rules as Record<string, unknown>)[key] as unknown[]), ...value];
      (rules as Record<string, unknown>)[key] = Array.from(new Set(merged));
    } else {
      (rules as Record<string, unknown>)[key] = value;
    }
  }
  return rules;
}

function textBlob(offer: Offer): string {
  const parts: string[] = [];
  for (const key of [
    "positioning", "targetAudience", "scenario", "painPoint", "purchaseMotivation",
    "recommendedPrice", "pricingReason", "mainTitle", "subTitle", "mainImageCopy",
    "mainImageDirection", "videoIdea",
  ]) {
    const v = (offer as Record<string, unknown>)[key];
    if (v) parts.push(String(v));
  }
  // 卖点/组合是字符串数组；主图结构与详情页结构是对象数组，需要展开内部字段
  for (const key of ["sellingPoints", "productBundle"]) {
    const v = (offer as Record<string, unknown>)[key];
    if (Array.isArray(v)) parts.push(...v.filter((x) => x).map((x) => String(x)));
  }
  for (const key of ["mainImageStructure", "detailPageStructure"]) {
    const v = (offer as Record<string, unknown>)[key];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (item && typeof item === "object") {
        for (const val of Object.values(item as Record<string, unknown>)) {
          if (val && typeof val !== "object") parts.push(String(val));
        }
      } else if (item) {
        parts.push(String(item));
      }
    }
  }
  const pr = offer.purchaseReason;
  if (pr && typeof pr === "object") {
    parts.push(...Object.values(pr).filter((v) => v).map((v) => String(v)));
  }
  return parts.join("\n");
}

function containsAny(text: string, terms: unknown): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  if (!Array.isArray(terms)) return found;
  for (const term of terms) {
    if (!term) continue;
    if (String(term).toLowerCase().includes && lower.includes(String(term).toLowerCase())) {
      found.push(String(term));
    }
  }
  return found;
}

function addIssue(issues: QualityIssue[], severity: string, field: string, message: string, suggestion = ""): void {
  issues.push({ severity, field, message, suggestion });
}

function scoreOf(issues: QualityIssue[]): number {
  let score = 100;
  for (const issue of issues) score -= issue.severity === "fail" ? 18 : 5;
  return Math.max(0, score);
}

function levelOf(score: number, hasFail: boolean): string {
  if (hasFail || score < 70) return "risk";
  if (score < 90) return "warning";
  return "good";
}

export function evaluateOffer(offer: Offer, rules?: QualityRules): QualityReport {
  const r = rules ?? loadRules();
  const issues: QualityIssue[] = [];
  const blob = textBlob(offer);

  const failHits = containsAny(blob, r.fail_terms);
  if (failHits.length) {
    addIssue(
      issues, "fail", "copy",
      "包含高风险或平台敏感表达：" + failHits.slice(0, 8).join("、"),
      "替换为可验证、克制的描述，避免绝对化、医疗化或站外导流表达。",
    );
  }

  const warningHits = containsAny(blob, r.warning_terms);
  if (warningHits.length) {
    addIssue(
      issues, "warning", "copy",
      "包含偏空泛或营销感过重的表达：" + warningHits.slice(0, 8).join("、"),
      "改成具体场景、具体人群、具体使用结果。",
    );
  }

  const title = String(offer.mainTitle ?? "").trim();
  const minLen = Number(r.title_min_len ?? 8);
  const maxLen = Number(r.title_max_len ?? 60);
  if (!title) {
    addIssue(issues, "fail", "mainTitle", "缺少商品主标题。", "补一个围绕场景和痛点的标题。");
  } else if (title.length < minLen) {
    addIssue(issues, "warning", "mainTitle", "主标题偏短，信息量可能不足。", "补充目标场景或核心痛点。");
  } else if (title.length > maxLen) {
    addIssue(issues, "warning", "mainTitle", "主标题偏长，列表页可读性会下降。", "压缩到 60 字以内。");
  }

  if (containsAny(String(offer.targetAudience ?? ""), r.vague_audience_terms).length) {
    addIssue(issues, "warning", "targetAudience", "目标人群偏泛。", "限定年龄、身份、生活方式或具体痛点。");
  }

  if (containsAny(String(offer.scenario ?? ""), r.vague_scene_terms).length) {
    addIssue(issues, "warning", "scenario", "使用场景偏泛。", "写清时间、地点和正在发生的动作。");
  }

  const sellingPoints = offer.sellingPoints;
  const validPoints = Array.isArray(sellingPoints)
    ? sellingPoints.filter((x) => String(x ?? "").trim()).length
    : 0;
  if (validPoints < 3) {
    addIssue(issues, "warning", "sellingPoints", "核心卖点少于 3 条。", "补足能支撑主卖点的具体卖点。");
  }

  const pr = (offer.purchaseReason && typeof offer.purchaseReason === "object") ? offer.purchaseReason : {};
  const required: string[] = Array.isArray(r.required_purchase_reason) ? r.required_purchase_reason : [];
  const missing = required.filter((k) => !String((pr as Record<string, unknown>)[k] ?? "").trim());
  if (missing.length) {
    addIssue(
      issues, "fail", "purchaseReason",
      "核心四问未完整回答：" + missing.join("、"),
      "补齐谁会买、什么时候买、为什么买、为什么愿意付这个价格。",
    );
  }

  const score = scoreOf(issues);
  return {
    score,
    level: levelOf(score, issues.some((i) => i.severity === "fail")),
    issues,
  };
}

/**
 * 同一「人群 + 场景」下出现多个档位时，检查档位之间是否真的有差异：
 * 只把档位词从低价改成平价、但价值构成和卖点几乎一样，属于「换价不换货」，会被标出来。
 */
function markWeakTierDiff(offers: Offer[]): void {
  const groups: Record<string, number[]> = {};
  offers.forEach((offer, idx) => {
    if (!offer || typeof offer !== "object") return;
    const rec = offer as Record<string, unknown>;
    const key = ["targetAudience", "scenario"]
      .map((f) => String(rec[f] ?? "").replace(/\s+/g, "").toLowerCase())
      .join("||");
    if (!key.replace(/\|/g, "")) return;
    (groups[key] = groups[key] || []).push(idx);
  });

  const norm = (v: unknown): string =>
    String(v ?? "").replace(/[\s，,。.、;；:：()（）]/g, "").toLowerCase();

  for (const idxs of Object.values(groups)) {
    if (idxs.length < 2) continue;
    // 两两比较价值构成与卖点
    for (let i = 0; i < idxs.length; i += 1) {
      for (let j = i + 1; j < idxs.length; j += 1) {
        const a = offers[idxs[i]] as Record<string, unknown>;
        const b = offers[idxs[j]] as Record<string, unknown>;
        const va = norm(a.valueForm);
        const vb = norm(b.valueForm);
        const pa = norm(a.positioning);
        const pb = norm(b.positioning);
        const sa = Array.isArray(a.sellingPoints) ? (a.sellingPoints as unknown[]).map(norm) : [];
        const sb = Array.isArray(b.sellingPoints) ? (b.sellingPoints as unknown[]).map(norm) : [];
        const sameValue = !!va && va === vb;
        const samePosition = !!pa && pa === pb;
        const samePoints = sa.length > 0 && sa.length === sb.length && sa.every((x, k) => x === sb[k]);
        // 价值构成 + 卖点都一样，或定位 + 卖点都一样 → 判定为换价不换货
        if ((sameValue && samePoints) || (samePosition && samePoints)) {
          for (const idx of [idxs[i], idxs[j]]) {
            const offer = offers[idx];
            if (!offer || typeof offer !== "object") continue;
            const report = (offer.qualityReport = offer.qualityReport ?? { score: 100, level: "good", issues: [] });
            addIssue(
              report.issues, "warning", "valueForm",
              "同一场景下这个档位与另一档的卖点和价值构成几乎一样，只是换了档位词。",
              "用规格/材质/包装/赠品/服务/组合做出真实差异，或干脆合并成一个档位。",
            );
            report.score = scoreOf(report.issues);
            report.level = levelOf(report.score, report.issues.some((x) => x.severity === "fail"));
          }
        }
      }
    }
  }
}

/** 同一「人群 + 场景 + 档位」重复才算真的雷同；
 *  同一个人群出现多次是正常的（不同场景/不同档位），不再单独判重。 */
function markDuplicateFields(offers: Offer[]): void {
  const seen: Record<string, number[]> = {};
  offers.forEach((offer, idx) => {
    if (!offer || typeof offer !== "object") return;
    const rec = offer as Record<string, unknown>;
    const key = ["targetAudience", "scenario", "priceTier"]
      .map((f) => String(rec[f] ?? "").replace(/\s+/g, "").toLowerCase())
      .join("||");
    if (!key.replace(/\|/g, "")) return;
    (seen[key] = seen[key] || []).push(idx);
  });

  for (const idxs of Object.values(seen)) {
    if (idxs.length < 2) continue;
    for (const idx of idxs) {
      const offer = offers[idx];
      if (!offer || typeof offer !== "object") continue;
      const report = (offer.qualityReport = offer.qualityReport ?? { score: 100, level: "good", issues: [] });
      addIssue(report.issues, "warning", "targetAudience", "这套「人群 + 场景 + 档位」与其他方案重复，差异化不足。", "换一个更细的人群画像、更具体的使用场景，或调整档位的价值构成。");
      report.score = scoreOf(report.issues);
      report.level = levelOf(report.score, report.issues.some((i) => i.severity === "fail"));
    }
  }
}

/** 返回带 qualityReport 的新结果对象（深度拷贝，不改动入参）。 */
export function attachQualityReport(result: AnalysisResult): AnalysisResult {
  let out: AnalysisResult = result && typeof result === "object" ? result : {};
  out = JSON.parse(JSON.stringify(out)) as AnalysisResult;
  const rules = loadRules();
  let offers = out.offers;
  if (!Array.isArray(offers)) {
    offers = [];
    out.offers = offers;
  }

  for (const offer of offers) {
    if (offer && typeof offer === "object") {
      offer.qualityReport = evaluateOffer(offer, rules);
    }
  }

  markDuplicateFields(offers);
  markWeakTierDiff(offers);

  const scores: number[] = [];
  let issueCount = 0;
  let failCount = 0;
  for (const o of offers) {
    if (!o || typeof o !== "object") continue;
    const qr = o.qualityReport;
    if (qr && typeof qr.score === "number") scores.push(qr.score);
    if (qr && Array.isArray(qr.issues)) {
      issueCount += qr.issues.length;
      failCount += qr.issues.filter((i) => i.severity === "fail").length;
    }
  }
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100;
  out.qualityReport = {
    score: avgScore,
    level: levelOf(avgScore, failCount > 0),
    issues: [],
    issueCount,
    failCount,
  };
  return out;
}
