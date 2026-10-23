// Port of backend/app/services/compliance.py — behavior-preserving.

const DEFAULT_BANNED_TERMS = '百分百,绝对有效,保证治愈,全网第一,国家级,点击关注,点赞收藏';
const HIGH_RISK_TERMS = ['治疗', '药物', '收益保证', '贷款', '未成年人'];

export function getBannedTerms(bannedTerms = DEFAULT_BANNED_TERMS): string[] {
  return bannedTerms
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

export function checkCompliance(text: string, bannedTerms = DEFAULT_BANNED_TERMS): {
  passed: boolean;
  issues: { term: string; type: string }[];
  notice: string;
} {
  const found = getBannedTerms(bannedTerms).filter((term) => term && text.includes(term));
  const highRisk = HIGH_RISK_TERMS.filter((term) => text.includes(term));
  const issues: { term: string; type: string }[] = [
    ...found.map((term) => ({ term, type: 'prohibited_claim' })),
    ...highRisk.map((term) => ({ term, type: 'high_risk_topic' })),
  ];
  return {
    passed: issues.length === 0,
    issues,
    notice: 'AI 风险提示不能替代平台人工审核。',
  };
}
