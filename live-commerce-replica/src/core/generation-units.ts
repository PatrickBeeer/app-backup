import type { GenerationUnit, Shot } from './types.js';

const MIN_DURATION = 4;
const MAX_DURATION = 15;

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function validBoundary(boundary: number, cursor: number, totalDuration: number): boolean {
  const unitDuration = boundary - cursor;
  const remainder = totalDuration - boundary;
  return unitDuration >= MIN_DURATION && unitDuration <= MAX_DURATION && (remainder === 0 || remainder >= MIN_DURATION);
}

export function buildGenerationUnits(shots: Shot[], duration: number): GenerationUnit[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('参考视频时长必须大于 0 秒');
  }

  const totalDuration = roundTime(duration);
  if (totalDuration <= MAX_DURATION) {
    return [{
      id: 'unit-1',
      start: 0,
      end: totalDuration,
      duration: totalDuration,
      requestDuration: Math.max(MIN_DURATION, Math.ceil(totalDuration)),
      shotIds: shots.filter((shot) => shot.start < totalDuration && shot.end > 0).map((shot) => shot.id),
      scriptLineIds: []
    }];
  }
  const shotBoundaries = shots
    .map((shot) => roundTime(shot.end))
    .filter((end) => end > 0 && end < totalDuration)
    .sort((a, b) => a - b);

  const cuts: number[] = [0];
  let cursor = 0;
  while (totalDuration - cursor > MAX_DURATION) {
    const naturalCut = shotBoundaries.find((boundary) => validBoundary(boundary, cursor, totalDuration));
    if (naturalCut !== undefined) {
      cuts.push(naturalCut);
      cursor = naturalCut;
      continue;
    }

    const latestCut = Math.min(cursor + MAX_DURATION, totalDuration - MIN_DURATION);
    const technicalCut = roundTime(latestCut);
    cuts.push(technicalCut);
    cursor = technicalCut;
  }

  while (totalDuration - cursor >= MIN_DURATION) {
    const naturalCut = shotBoundaries.find((boundary) => validBoundary(boundary, cursor, totalDuration));
    if (naturalCut === undefined) break;
    cuts.push(naturalCut);
    cursor = naturalCut;
  }

  if (cuts.at(-1) !== totalDuration) cuts.push(totalDuration);

  return cuts.slice(0, -1).map((start, index) => {
    const end = cuts[index + 1]!;
    const unitDuration = roundTime(end - start);
    const intersectingShots = shots.filter((shot) => shot.start < end && shot.end > start);
    return {
      id: `unit-${index + 1}`,
      start,
      end,
      duration: unitDuration,
      requestDuration: Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.ceil(unitDuration))),
      shotIds: intersectingShots.map((shot) => shot.id),
      scriptLineIds: []
    };
  });
}
