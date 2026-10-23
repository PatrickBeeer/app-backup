import type { ReferenceTranscriptSegment, SpeechSegment } from './types.js';

function overlapDuration(left: ReferenceTranscriptSegment, right: SpeechSegment): number {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function distanceToSegment(chunk: ReferenceTranscriptSegment, segment: SpeechSegment): number {
  if (chunk.end < segment.start) return segment.start - chunk.end;
  if (chunk.start > segment.end) return chunk.start - segment.end;
  return 0;
}

export function alignTranscriptToSpeech(
  chunks: ReferenceTranscriptSegment[],
  speechSegments: SpeechSegment[]
): ReferenceTranscriptSegment[] {
  const assigned = speechSegments.map(() => [] as string[]);

  for (const chunk of chunks) {
    const text = chunk.text.replace(/\s+/g, ' ').trim();
    if (!text || speechSegments.length === 0) continue;

    let bestIndex = 0;
    let bestOverlap = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    speechSegments.forEach((segment, index) => {
      const overlap = overlapDuration(chunk, segment);
      const distance = distanceToSegment(chunk, segment);
      if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
        bestIndex = index;
        bestOverlap = overlap;
        bestDistance = distance;
      }
    });
    assigned[bestIndex]!.push(text);
  }

  return speechSegments.map((segment, index) => ({
    id: segment.id,
    start: segment.start,
    end: segment.end,
    text: assigned[index]!.join('')
  }));
}
