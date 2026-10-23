import type { ProductBrief, ScriptLine, SpeechSegment } from './types.js';

function sanitize(text: string, forbiddenClaims: string[]): string {
  return forbiddenClaims.reduce((value, phrase) => value.replaceAll(phrase, ''), text).replace(/\s+/g, ' ').trim();
}

function defaultSegments(duration: number): SpeechSegment[] {
  const count = Math.max(3, Math.min(10, Math.round(duration / 4)));
  const segmentDuration = duration / count;
  return Array.from({ length: count }, (_, index) => ({
    id: `speech-${index + 1}`,
    start: Math.round(index * segmentDuration * 1000) / 1000,
    end: Math.round((index + 1) * segmentDuration * 1000) / 1000
  }));
}

function candidateLines(product: ProductBrief): string[] {
  const factLines = [
    `先别划走，今天给你们看看这款${product.name}`,
    ...product.sellingPoints.map((point) => `它的${point}，日常使用真的很方便`),
    ...product.specifications.map((specification) => `${specification}的规格，拿在手里刚刚好`),
    ...product.requiredClaims.map((claim) => `重点是${claim}，选起来更放心`)
  ];
  if (product.price) factLines.push(`现在的参考价格是${product.price}，需要的可以进一步了解`);
  factLines.push(`这款${product.name}的核心信息都给你们说明白了`);
  return factLines.map((line) => sanitize(line, product.forbiddenClaims));
}

export function buildFallbackScript(
  detectedSegments: SpeechSegment[],
  product: ProductBrief,
  videoDuration = detectedSegments.at(-1)?.end ?? 12
): ScriptLine[] {
  const segments = detectedSegments.length > 0 ? detectedSegments : defaultSegments(videoDuration);
  const candidates = candidateLines(product);
  return segments.map((segment, index) => ({
    id: `line-${index + 1}`,
    start: segment.start,
    end: segment.end,
    text: candidates[index % candidates.length]!,
    source: 'fallback'
  }));
}
