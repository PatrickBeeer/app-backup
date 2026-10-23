// Port of backend/app/services/originality.py — behavior-preserving.
// Python's difflib.SequenceMatcher (autojunk=False) is ported faithfully as the
// Ratcliff-Obershelp algorithm (recursive longest contiguous matching blocks),
// so the original similarity thresholds (0.62/0.45/0.72 titles, 0.52/0.28/0.35
// bodies) keep their tuned meaning.

export function normalizeText(value: string): string {
  return (value || '').replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, '').toLowerCase();
}

function ngrams(value: string, size: number): Set<string> {
  if (value.length < size) {
    return value ? new Set([value]) : new Set();
  }
  const out = new Set<string>();
  for (let i = 0; i <= value.length - size; i += 1) {
    out.add(value.slice(i, i + size));
  }
  return out;
}

interface Match {
  i: number;
  j: number;
  size: number;
}

// Longest common SUBSTRING within [alo,ahi) x [blo,bhi). O((ahi-alo)*(bhi-blo)).
function findLongestMatch(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): Match {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let prev = new Map<number, number>();
  for (let i = alo; i < ahi; i += 1) {
    const ai = a[i];
    const cur = new Map<number, number>();
    for (let j = blo; j < bhi; j += 1) {
      if (b[j] === ai) {
        const k = (prev.get(j - 1) || 0) + 1;
        cur.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
    }
    prev = cur;
  }
  return { i: besti, j: bestj, size: bestsize };
}

function getMatchingBlocks(a: string, b: string): Match[] {
  const blocks: Match[] = [];
  const recurse = (alo: number, ahi: number, blo: number, bhi: number) => {
    const m = findLongestMatch(a, b, alo, ahi, blo, bhi);
    if (m.size === 0) return;
    recurse(alo, m.i, blo, m.j);
    blocks.push(m);
    recurse(m.i + m.size, ahi, m.j + m.size, bhi);
  };
  recurse(0, a.length, 0, b.length);
  return blocks;
}

// Ratcliff-Obershelp ratio on RAW (non-normalized) strings. Used for
// inter-candidate dedup in title_quality.select_clickable_titles, mirroring
// Python's `SequenceMatcher(None, title, chosen).ratio()` on raw titles.
export function sequenceRatioRaw(a: string, b: string): number {
  if (!a || !b) return 0;
  const matches = getMatchingBlocks(a, b).reduce((sum, block) => sum + block.size, 0);
  return matches > 0 ? (2 * matches) / (a.length + b.length) : 0;
}

function sequenceRatio(a: string, b: string): number {
  return sequenceRatioRaw(a, b);
}

export function similarity(
  source: string,
  candidate: string,
  ngramSize = 4,
): { sequence: number; ngram: number; longest_ratio: number } {
  const left = normalizeText(source);
  const right = normalizeText(candidate);
  if (!left || !right) {
    return { sequence: 0, ngram: 0, longest_ratio: 0 };
  }
  const leftGrams = ngrams(left, ngramSize);
  const rightGrams = ngrams(right, ngramSize);
  const union = new Set<string>([...leftGrams, ...rightGrams]);
  const intersection = new Set<string>([...leftGrams].filter((g) => rightGrams.has(g)));
  const longest = findLongestMatch(left, right, 0, left.length, 0, right.length).size;
  return {
    sequence: round(sequenceRatio(left, right), 4),
    ngram: union.size > 0 ? round(intersection.size / union.size, 4) : 0,
    longest_ratio: round(longest / Math.max(1, Math.min(left.length, right.length)), 4),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function titleIsTooSimilar(
  source: string,
  candidate: string,
): [boolean, { sequence: number; ngram: number; longest_ratio: number }] {
  const scores = similarity(source, candidate, 2);
  return [
    scores.sequence >= 0.62 || scores.ngram >= 0.45 || scores.longest_ratio >= 0.72,
    scores,
  ];
}

export function bodyIsTooSimilar(
  source: string,
  candidate: string,
): [boolean, { sequence: number; ngram: number; longest_ratio: number }] {
  const scores = similarity(source, candidate, 5);
  return [
    scores.sequence >= 0.52 || scores.ngram >= 0.28 || scores.longest_ratio >= 0.35,
    scores,
  ];
}
