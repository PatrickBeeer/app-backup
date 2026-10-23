// Port of backend/app/services/title_quality.py — behavior-preserving.

import { sequenceRatioRaw, titleIsTooSimilar } from './originality';

const BLAND_PHRASES = [
  '干货分享', '建议收藏', '值得收藏', '赶紧收藏', '全面解析', '深度解析',
  '必看攻略', '保姆级教程', '一文看懂', '你一定要知道', '不容错过',
  '助力', '赋能', '开启新篇章', '提升你的', '值得一看',
];
const HUMAN_SIGNALS = ['我', '你', '谁懂', '原来', '后来', '直到', '说实话', '别', '真的', '没想到'];
const TENSION_SIGNALS = ['却', '才', '反而', '居然', '竟然', '后悔', '难怪', '为什么', '不是', '而是', '差别'];
const SCENE_SIGNALS = ['上班', '下班', '职场', '新手', '第一次', '用了', '做完', '开始', '每天', '个月', '岁', '人'];

export function titleQuality(title: string): [number, string[]] {
  const text = title.replace(/\s+/g, '').trim();
  const issues: string[] = [];
  let score = 0;
  if (text.length >= 10 && text.length <= 28) {
    score += 1;
  } else {
    issues.push('长度缺少小红书短标题的节奏');
  }
  if (HUMAN_SIGNALS.some((signal) => text.includes(signal))) score += 1;
  if (TENSION_SIGNALS.some((signal) => text.includes(signal))) score += 1;
  if (/\d/.test(text) || SCENE_SIGNALS.some((signal) => text.includes(signal))) score += 1;
  if (BLAND_PHRASES.some((phrase) => text.includes(phrase))) {
    score -= 2;
    issues.push('含模板化或营销腔表达');
  }
  const exclaimCount = (text.match(/!/g) || []).length + (text.match(/！/g) || []).length;
  if (exclaimCount > 1) {
    score -= 1;
    issues.push('感叹号过多');
  }
  if (issues.length === 0 && score < 2) {
    issues.push('缺少人群、场景、反差或具体结果');
  }
  return [score, issues];
}

export function selectClickableTitles(
  candidates: string[],
  sourceTitle: string,
  limit = 3,
): string[] {
  const ranked: { score: number; negIndex: number; title: string }[] = [];
  const seen = new Set<string>();
  candidates.forEach((raw, index) => {
    const title = raw.trim();
    const normalized = title.replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase();
    if (!title || seen.has(normalized) || titleIsTooSimilar(sourceTitle, title)[0]) return;
    seen.add(normalized);
    const [score] = titleQuality(title);
    ranked.push({ score, negIndex: -index, title });
  });
  ranked.sort((a, b) => b.score - a.score || b.negIndex - a.negIndex);
  const selected: string[] = [];
  for (const { title } of ranked) {
    // 网感分只负责排序，不作为交付门槛。硬门槛仅保留原创性、去重和候选之间的明显雷同。
    if (selected.some((chosen) => sequenceRatioRaw(chosen, title) >= 0.78)) continue;
    selected.push(title);
    if (selected.length === limit) break;
  }
  return selected;
}

export function hasEnoughHighQualityTitles(candidates: string[], minimum = 3): boolean {
  return candidates.filter((title) => titleQuality(title)[0] >= 2).length >= minimum;
}
