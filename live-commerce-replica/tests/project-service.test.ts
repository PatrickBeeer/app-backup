import { describe, expect, it } from 'vitest';
import { ProjectService } from '../src/services/project-service.js';
import { ProjectStore } from '../src/store/project-store.js';
import type { CreateProjectInput, GenerationUnit, ReferenceTranscriptSegment } from '../src/core/types.js';
import type { AnalysisDraft, ProjectAnalyzer, ReferenceTranscriber } from '../src/services/project-service.js';

const input: CreateProjectInput = {
  name: '夏季水杯', ratio: '9:16', presenterMode: 'reference', referenceVideo: 'reference.mp4',
  personPhotos: ['p1.jpg', 'p2.jpg', 'p3.jpg'], productImages: ['sku.jpg'],
  product: {
    name: '便携保温杯', price: '99 元', sellingPoints: ['316 不锈钢'], specifications: ['500mL'],
    requiredClaims: ['食品接触级材质'], forbiddenClaims: ['全网最低价']
  }
};

function createService(duration = 30, extensions: {
  transcriber?: ReferenceTranscriber;
  analyzer?: ProjectAnalyzer;
} = {}) {
  const store = new ProjectStore(':memory:');
  const sliced: string[] = [];
  const media = {
    probeVideo: async () => ({ duration, width: 1080, height: 1920, fps: 30, hasVideo: true, hasAudio: true }),
    detectShots: async () => [
      { id: 'shot-1', start: 0, end: 3 }, { id: 'shot-2', start: 3, end: 7 },
      { id: 'shot-3', start: 7, end: 14 }, { id: 'shot-4', start: 14, end: 22 },
      { id: 'shot-5', start: 22, end: 30 }
    ],
    detectSpeechSegments: async () => [
      { id: 'speech-1', start: 0.5, end: 4 }, { id: 'speech-2', start: 5, end: 9 },
      { id: 'speech-3', start: 10, end: 14 }, { id: 'speech-4', start: 16, end: 21 },
      { id: 'speech-5', start: 23, end: 29 }
    ],
    extractRepresentativeFrames: async () => ['frame-1.jpg', 'frame-2.jpg'],
    sliceGenerationUnit: async (_path: string, unit: GenerationUnit, outputPath: string) => {
      sliced.push(unit.id);
      return outputPath;
    },
    extractBoundaryFrame: async (_path: string, _time: number, outputPath: string) => outputPath
  };
  return {
    store,
    sliced,
    service: new ProjectService({
      store, dataDir: 'data', ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', media,
      ...(extensions.transcriber ? { transcriber: extensions.transcriber } : {}),
      ...(extensions.analyzer ? { analyzer: extensions.analyzer } : {})
    })
  };
}

describe('ProjectService', () => {
  it('analyzes a long reference without a product duration cap', async () => {
    const { store, service } = createService(95);
    const project = store.createProject(input);

    const analyzed = await service.analyze(project.id);

    expect(analyzed.status).toBe('READY_TO_CONFIRM');
    expect(analyzed.analysis?.probe.duration).toBe(95);
    expect(analyzed.analysis?.generationUnits.at(-1)?.end).toBe(95);
  });

  it('analyzes a reference into prepared generation units and a fallback script', async () => {
    const { store, sliced, service } = createService();
    const project = store.createProject(input);

    const analyzed = await service.analyze(project.id);

    expect(analyzed.status).toBe('READY_TO_CONFIRM');
    expect(analyzed.analysis?.generationUnits.length).toBeGreaterThan(1);
    expect(analyzed.analysis?.script).toHaveLength(5);
    expect(analyzed.analysis?.degraded).toBe(true);
    expect(sliced).toEqual(analyzed.analysis?.generationUnits.map((unit) => unit.id));
    expect(analyzed.analysis?.generationUnits.every((unit) => unit.referenceAudio === undefined)).toBe(true);
  });

  it('aligns a local transcript and passes it to the product-copy analyzer', async () => {
    let receivedTranscript: ReferenceTranscriptSegment[] | undefined;
    const transcriber: ReferenceTranscriber = {
      transcribe: async () => [{ id: 'chunk-1', start: 0.5, end: 4, text: '姐妹们这件长袖真的很显瘦' }]
    };
    const analyzer: ProjectAnalyzer = {
      analyze: async (analysisInput) => {
        receivedTranscript = analysisInput.referenceTranscript;
        const draft: AnalysisDraft = {
          summary: '结构仿写完成',
          script: analysisInput.speechSegments.map((segment, index) => ({
            id: `line-${index + 1}`, start: segment.start, end: segment.end,
            text: `便携保温杯口播${index + 1}`, source: 'llm'
          })),
          overlays: [],
          warnings: []
        };
        return draft;
      }
    };
    const { store, service } = createService(30, { transcriber, analyzer });
    const project = store.createProject(input);

    const analyzed = await service.analyze(project.id);

    expect(receivedTranscript?.[0]).toEqual({
      id: 'speech-1', start: 0.5, end: 4, text: '姐妹们这件长袖真的很显瘦'
    });
    expect(analyzed.analysis?.referenceTranscript).toEqual(receivedTranscript);
    expect(analyzed.analysis?.degraded).toBe(false);
  });

  it('degrades to fact-based copy when local transcription fails', async () => {
    const transcriber: ReferenceTranscriber = {
      transcribe: async () => { throw new Error('模型下载失败'); }
    };
    const { store, service } = createService(30, { transcriber });
    const project = store.createProject(input);

    const analyzed = await service.analyze(project.id);

    expect(analyzed.status).toBe('READY_TO_CONFIRM');
    expect(analyzed.analysis?.referenceTranscript).toEqual([]);
    expect(analyzed.analysis?.warnings).toContain('本地台词转写降级：模型下载失败');
  });

  it('does not create paid generation jobs before confirmation', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    await service.analyze(project.id);

    expect(() => service.startGeneration(project.id)).toThrow('请先确认生成方案');
    expect(store.listJobs(project.id)).toHaveLength(0);
  });

  it('creates one pending job per generation unit after one-time confirmation', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    const analyzed = await service.analyze(project.id);
    service.confirm(project.id);

    const jobs = service.startGeneration(project.id, false);

    expect(jobs).toHaveLength(analyzed.analysis?.generationUnits.length ?? 0);
    expect(jobs.every((job) => job.status === 'PENDING' && job.provider === 'cprt-multimodal')).toBe(true);
    expect(store.getProject(project.id)?.status).toBe('GENERATING');
  });

  it('updates only script text while preserving IDs and timestamps', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    const analyzed = await service.analyze(project.id);
    const original = analyzed.analysis!.script;
    const edits = original.map((line, index) => ({ id: line.id, text: `更新后的口播${index + 1}` }));

    const updated = service.updateScript(project.id, edits);

    expect(updated.analysis!.script).toEqual(original.map((line, index) => ({
      ...line,
      text: `更新后的口播${index + 1}`
    })));
  });

  it('rejects script edits that do not match every saved line ID in order', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    const analyzed = await service.analyze(project.id);
    const edits = analyzed.analysis!.script.slice(1).map((line) => ({ id: line.id, text: line.text }));

    expect(() => service.updateScript(project.id, edits)).toThrow('口播段落必须与分析结果一一对应');
  });

  it('rejects blank copy and forbidden claims before persisting edits', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    const analyzed = await service.analyze(project.id);
    const base = analyzed.analysis!.script.map((line) => ({ id: line.id, text: line.text }));

    expect(() => service.updateScript(project.id, base.map((line, index) => ({
      ...line, text: index === 0 ? '   ' : line.text
    })))).toThrow('口播不能为空');
    expect(() => service.updateScript(project.id, base.map((line, index) => ({
      ...line, text: index === 0 ? '这是全网最低价' : line.text
    })))).toThrow('新口播包含禁止表达：全网最低价');
  });

  it('rejects script edits after generation has started', async () => {
    const { store, service } = createService();
    const project = store.createProject(input);
    const analyzed = await service.analyze(project.id);
    const edits = analyzed.analysis!.script.map((line) => ({ id: line.id, text: line.text }));
    service.confirm(project.id);
    service.startGeneration(project.id);

    expect(() => service.updateScript(project.id, edits)).toThrow('仅可在生成前修改口播');
  });
});
