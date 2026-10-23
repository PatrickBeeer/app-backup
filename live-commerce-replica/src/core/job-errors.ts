import type { GenerationJob } from './types.js';

export const CONTENT_MODERATION_GUIDANCE =
  '平台本次内容审核未通过。审核结果可能存在波动；确认人物明确成年且素材合规后，可手动再次生成，若仍失败请更换素材。';

export function isContentModerationError(message: string | undefined): boolean {
  return Boolean(message && /sensitive content|敏感内容|content moderation|内容审核/i.test(message));
}

export function generationJobDisplayIssues(job: Pick<GenerationJob, 'error' | 'issues'>): string[] {
  const messages = [...(job.issues ?? []), job.error]
    .filter((message): message is string => Boolean(message?.trim()))
    .map((message) => message.trim());
  const unique = [...new Set(messages)];
  if (unique.some(isContentModerationError)) unique.push(CONTENT_MODERATION_GUIDANCE);
  return unique;
}
