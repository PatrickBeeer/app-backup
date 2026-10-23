import type { Status } from '../types';

const steps: [string, string][] = [
  ['fetching', '获取笔记'],
  ['processing_media', '处理素材'],
  ['analyzing', 'AI 拆解'],
  ['completed', '完成报告'],
];
const generationSteps: [string, string][] = [
  ['queued', '等待生成'],
  ['generating_copy', '生成正文'],
  ['generating_cover', '生成封面'],
  ['completed', '内容完成'],
];
const order: Status[] = ['queued', 'fetching', 'processing_media', 'analyzing', 'generating', 'completed'];

export function StatusRail({
  status,
  stage,
  mode = 'analysis',
  video = false,
}: {
  status: Status;
  stage: string;
  mode?: 'analysis' | 'generation';
  video?: boolean;
}) {
  if (mode === 'generation') {
    const activeSteps = video
      ? [
          ['queued', '等待生成'],
          ['generating_copy', '生成正文'],
          ['generating_script', '生成分镜'],
          ['completed', '内容完成'],
        ] as [string, string][]
      : generationSteps;
    const current =
      stage === 'generating_cover' ? 2 : stage === 'completed' ? 3 : stage === 'generating_copy' || status === 'generating' ? 1 : 0;
    return (
      <section className="status-rail" aria-live="polite">
        <div className="eyebrow">CONTENT / {status === 'failed' ? 'FAILED' : stage}</div>
        <ol>
          {activeSteps.map(([key, label], i) => (
            <li className={i <= current && status !== 'failed' ? 'active' : ''} key={key}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const at = order.indexOf(status);
  return (
    <section className="status-rail" aria-live="polite">
      <div className="eyebrow">PROCESS / {stage}</div>
      <ol>
        {steps.map(([key, label], i) => {
          const idx = order.indexOf(key as Status);
          return (
            <li className={at >= idx ? 'active' : ''} key={key}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
