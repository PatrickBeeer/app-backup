# 真人带货视频复刻工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一套可在本机运行、可用演示模式完整验收、并可接入智算谷 Seedance 2.0 多模态视频接口的真人带货视频复刻工作台。

**Architecture:** Node 24 + Hono 提供本地 API 和静态前端，SQLite 持久化项目/任务，FFmpeg 完成媒体分析、切段、技术质检和合成。视频 Provider、媒体发布器与演示生成器通过小型接口隔离，使付费远端任务和本地演示任务共享同一状态机。

**Tech Stack:** TypeScript、Hono、Node `sqlite`、Zod、Vitest、FFmpeg/FFprobe、vanilla HTML/CSS/JavaScript、智算谷异步 API、腾讯 COS（可选）。

## Global Constraints

- Node.js 版本不低于 22；当前验证运行时为 Node 24。
- 服务端口固定为 3013，并登记到 `E:/AI/AI项目/端口注册/PORTS.md`。
- 首版只接收 30–60 秒 MP4/MOV/WebM，输出 720p 的 9:16 或 16:9。
- 主模型固定 `free-video-2.0-multimodal-video`，备用模型固定 `free-video-2.0-image-to-video`。
- API Key 只读 `.env`，禁止进入前端、SQLite、日志和 Git。
- 用户确认前禁止提交任何付费视频任务。
- 每个远端任务 ID 必须持久化，重启和查询重试禁止重复提交。
- 生成函数遵守测试先行；每个行为测试必须先观察到因缺少实现而失败。

---

### Task 1: 项目骨架、配置和持久化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.ts`
- Create: `src/core/types.ts`
- Create: `src/store/project-store.ts`
- Test: `tests/project-store.test.ts`

**Interfaces:**
- Produces: `loadConfig(env): AppConfig`、`ProjectStore.createProject(input)`、`ProjectStore.getProject(id)`、`ProjectStore.saveProject(project)`、`ProjectStore.listProjects()`、`ProjectStore.createJob(job)`、`ProjectStore.saveJob(job)`。

- [ ] **Step 1: Write the failing persistence and secret-boundary tests**

```ts
it('round-trips project data without persisting API credentials', () => {
  const store = new ProjectStore(':memory:');
  const saved = store.createProject(projectInput);
  expect(store.getProject(saved.id)?.name).toBe('夏季水杯');
  expect(JSON.stringify(store.getProject(saved.id))).not.toContain('secret-key');
});
```

- [ ] **Step 2: Run the focused test and confirm module-not-found failure**

Run: `npm test -- tests/project-store.test.ts`

- [ ] **Step 3: Implement configuration validation, domain types and two-table SQLite store**

```ts
export interface ProjectStorePort {
  createProject(input: CreateProjectInput): Project;
  getProject(id: string): Project | undefined;
  saveProject(project: Project): void;
  listProjects(): Project[];
  createJob(job: GenerationJob): void;
  saveJob(job: GenerationJob): void;
  listJobs(projectId: string): GenerationJob[];
}
```

- [ ] **Step 4: Run persistence tests and typecheck**

Run: `npm test -- tests/project-store.test.ts && npm run typecheck`

- [ ] **Step 5: Commit the independently working store**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example src/config.ts src/core/types.ts src/store/project-store.ts tests/project-store.test.ts
git commit -m "feat: add project persistence foundation"
```

### Task 2: 镜头、语音和生成单元分析

**Files:**
- Create: `src/core/generation-units.ts`
- Create: `src/core/script.ts`
- Create: `src/media/ffmpeg.ts`
- Test: `tests/generation-units.test.ts`
- Test: `tests/script.test.ts`

**Interfaces:**
- Produces: `buildGenerationUnits(shots, duration): GenerationUnit[]`、`buildFallbackScript(speechSegments, product): ScriptLine[]`、`probeVideo(path)`、`detectShots(path)`、`detectSpeechSegments(path)`、`extractFrames(path, outputDir)`、`sliceGenerationUnit(path, unit, outputPath)`。

- [ ] **Step 1: Write failing tests for legal unit durations and tail merging**

```ts
it('groups short shots into 4-15 second units without losing the timeline', () => {
  const units = buildGenerationUnits([
    { start: 0, end: 1.8 }, { start: 1.8, end: 4.2 },
    { start: 4.2, end: 7.5 }, { start: 7.5, end: 10 }
  ], 10);
  expect(units.map((unit) => [unit.start, unit.end, unit.requestDuration])).toEqual([
    [0, 4.2, 5], [4.2, 10, 6]
  ]);
});
```

- [ ] **Step 2: Run the unit test and confirm the missing-function failure**

Run: `npm test -- tests/generation-units.test.ts`

- [ ] **Step 3: Implement the pure grouping and fallback-script functions**

```ts
export function buildGenerationUnits(shots: Shot[], duration: number): GenerationUnit[];
export function buildFallbackScript(segments: SpeechSegment[], product: ProductBrief): ScriptLine[];
```

- [ ] **Step 4: Run pure tests, then add FFmpeg command wrappers**

Run: `npm test -- tests/generation-units.test.ts tests/script.test.ts`

- [ ] **Step 5: Commit media analysis behavior**

```bash
git add src/core/generation-units.ts src/core/script.ts src/media/ffmpeg.ts tests/generation-units.test.ts tests/script.test.ts
git commit -m "feat: analyze reference video into generation units"
```

### Task 3: 智算谷请求契约与媒体发布

**Files:**
- Create: `src/providers/cprt.ts`
- Create: `src/providers/media-publisher.ts`
- Create: `src/core/prompts.ts`
- Test: `tests/cprt.test.ts`
- Test: `tests/prompts.test.ts`

**Interfaces:**
- Produces: `buildMultimodalPayload(input): CprtMultimodalPayload`、`buildImageFallbackPayload(input): CprtImagePayload`、`CprtProvider.submit(payload)`、`CprtProvider.query(taskId)`、`MediaPublisher.publish(localPath)`。

- [ ] **Step 1: Write a failing contract test that distinguishes person and product slots**

```ts
it('assetizes only person photos and keeps the reference video out of conversion slots', () => {
  const body = buildMultimodalPayload({
    personUrls: ['p1', 'p2', 'p3'], productUrls: ['sku1'],
    referenceVideoUrl: 'reference.mp4', referenceAudioUrl: 'reference.mp3',
    prompt: 'new script', ratio: '9:16', requestDuration: 6
  });
  expect(body.imageUrls).toEqual(['p1', 'p2', 'p3', 'sku1']);
  expect(body.conversionSlots).toEqual(['image1', 'image2', 'image3']);
  expect(body.videoUrls).toEqual(['reference.mp4']);
  expect(body.generateAudio).toBe(true);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails for missing implementation**

Run: `npm test -- tests/cprt.test.ts`

- [ ] **Step 3: Implement payload builders, provider polling normalization and COS/public-base publishers**

```ts
export interface VideoProvider {
  submit(payload: CprtMultimodalPayload | CprtImagePayload): Promise<{ taskId: string }>;
  query(taskId: string): Promise<NormalizedRemoteTask>;
}
```

- [ ] **Step 4: Run provider and prompt tests**

Run: `npm test -- tests/cprt.test.ts tests/prompts.test.ts`

- [ ] **Step 5: Commit the external boundary**

```bash
git add src/providers/cprt.ts src/providers/media-publisher.ts src/core/prompts.ts tests/cprt.test.ts tests/prompts.test.ts
git commit -m "feat: add cprt multimodal video provider"
```

### Task 4: 项目编排、演示生成和后台任务恢复

**Files:**
- Create: `src/services/project-service.ts`
- Create: `src/services/demo-generator.ts`
- Create: `src/services/job-worker.ts`
- Test: `tests/project-service.test.ts`
- Test: `tests/job-worker.test.ts`

**Interfaces:**
- Consumes: project store、FFmpeg media functions、provider and publisher ports。
- Produces: `ProjectService.analyze(projectId)`、`ProjectService.confirm(projectId)`、`ProjectService.startGeneration(projectId)`、`JobWorker.tick()`、`JobWorker.start()`、`JobWorker.stop()`。

- [ ] **Step 1: Write failing tests for the confirmation gate and restart-safe polling**

```ts
it('does not submit generation before the project is confirmed', async () => {
  await expect(service.startGeneration(project.id)).rejects.toThrow('请先确认生成方案');
  expect(provider.submittedPayloads).toHaveLength(0);
});

it('polls a persisted remote id without resubmitting after restart', async () => {
  await worker.tick();
  expect(provider.submittedPayloads).toHaveLength(0);
  expect(provider.queriedIds).toEqual(['remote-42']);
});
```

- [ ] **Step 2: Run orchestration tests and confirm expected failures**

Run: `npm test -- tests/project-service.test.ts tests/job-worker.test.ts`

- [ ] **Step 3: Implement analysis, confirmation, submission, one automatic retry and demo clip generation**

```ts
export class JobWorker {
  constructor(deps: WorkerDependencies);
  async tick(): Promise<void>;
  start(intervalMs?: number): void;
  stop(): void;
}
```

- [ ] **Step 4: Run orchestration tests and the complete test suite**

Run: `npm test`

- [ ] **Step 5: Commit the restart-safe workflow**

```bash
git add src/services/project-service.ts src/services/demo-generator.ts src/services/job-worker.ts tests/project-service.test.ts tests/job-worker.test.ts
git commit -m "feat: orchestrate confirmed generation jobs"
```

### Task 5: 技术质检、审核动作与最终合成

**Files:**
- Create: `src/media/quality.ts`
- Create: `src/media/render.ts`
- Create: `src/core/ass.ts`
- Test: `tests/quality.test.ts`
- Test: `tests/ass.test.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Produces: `inspectGeneratedClip(path, expected): QualityReport`、`buildAss(project): string`、`renderFinal(project, acceptedJobs, outputPath): Promise<string>`。

- [ ] **Step 1: Write failing tests for duration/audio failures and safe ASS escaping**

```ts
it('requires review when generated duration is too short or audio is missing', () => {
  const report = evaluateProbe({ duration: 4.1, hasVideo: true, hasAudio: false, width: 720, height: 1280 }, { duration: 5, ratio: '9:16' });
  expect(report.passed).toBe(false);
  expect(report.issues).toEqual(['片段时长不足', '缺少原生音轨']);
});
```

- [ ] **Step 2: Run quality tests and confirm missing implementation failures**

Run: `npm test -- tests/quality.test.ts tests/ass.test.ts`

- [ ] **Step 3: Implement probe evaluation, accepted-job gate, normalization, concat and ASS burn-in**

```ts
export async function renderFinal(input: RenderInput): Promise<string>;
```

- [ ] **Step 4: Run media unit tests and one generated-fixture render test**

Run: `npm test -- tests/quality.test.ts tests/ass.test.ts tests/render.test.ts`

- [ ] **Step 5: Commit review and render behavior**

```bash
git add src/media/quality.ts src/media/render.ts src/core/ass.ts tests/quality.test.ts tests/ass.test.ts tests/render.test.ts
git commit -m "feat: review and render accepted video units"
```

### Task 6: Hono API 与本地媒体安全边界

**Files:**
- Create: `src/app.ts`
- Create: `src/routes/projects.ts`
- Create: `src/routes/jobs.ts`
- Create: `src/index.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Produces: `createApp(deps): Hono` and the HTTP routes described in the design spec。

- [ ] **Step 1: Write failing route tests for upload validation and paid confirmation gate**

```ts
it('rejects references outside 30-60 seconds before creating a project', async () => {
  const response = await app.request('/api/projects', { method: 'POST', body: invalidMultipart });
  expect(response.status).toBe(422);
});
```

- [ ] **Step 2: Run API tests and confirm the app module is missing**

Run: `npm test -- tests/api.test.ts`

- [ ] **Step 3: Implement upload, analyze, confirm, generate, accept, regenerate, replace, render and media routes**

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
POST   /api/projects/:id/analyze
POST   /api/projects/:id/confirm
POST   /api/projects/:id/generate
POST   /api/projects/:id/render
POST   /api/jobs/:id/accept
POST   /api/jobs/:id/regenerate
POST   /api/jobs/:id/replacement
GET    /media/:projectId/*
```

- [ ] **Step 4: Run API tests and typecheck**

Run: `npm test -- tests/api.test.ts && npm run typecheck`

- [ ] **Step 5: Commit the HTTP surface**

```bash
git add src/app.ts src/routes/projects.ts src/routes/jobs.ts src/index.ts tests/api.test.ts
git commit -m "feat: expose local replication workflow api"
```

### Task 7: 产品化前端

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

**Interfaces:**
- Consumes: Task 6 HTTP routes。
- Produces: project list, upload form, analysis progress, confirmation timeline, generation status, review comparison and final download UI。

- [ ] **Step 1: Define a browser smoke test against the API-backed page**

```text
Open http://127.0.0.1:3013, verify the page title is “镜刻”, create a project with valid fixtures, run analysis, confirm generation, accept demo clips, render and verify the final download link returns video/mp4.
```

- [ ] **Step 2: Start the server and observe the smoke check fail because the static product UI is absent**

Run: `npm start`

- [ ] **Step 3: Implement the responsive single-page workflow with concrete Chinese product copy**

```html
<main id="app" aria-live="polite"></main>
<script type="module" src="/app.js"></script>
```

- [ ] **Step 4: Re-run the smoke path and keyboard-accessible form checks**

Run: `npm test && npm run typecheck`

- [ ] **Step 5: Commit the user-facing workflow**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: add jingke video replication workspace"
```

### Task 8: 交接文档、启动脚本和完整验收

**Files:**
- Create: `README.md`
- Create: `scripts/start.cmd`
- Create: `scripts/smoke-demo.mjs`
- Modify: `E:/AI/AI项目/端口注册/PORTS.md`
- Modify: `E:/AI/AI项目/obstian/Codex/projects/ai-tool-line.md`
- Create: `E:/AI/AI项目/obstian/Codex/projects/jingke-live-commerce-replica.md`

**Interfaces:**
- Produces: one-command local startup and automated end-to-end demo verification。

- [ ] **Step 1: Write the smoke runner to create media fixtures and drive every API state**

```js
const result = await runDemoSmoke({ baseUrl: 'http://127.0.0.1:3013' });
if (!result.finalVideo.endsWith('.mp4')) process.exit(1);
```

- [ ] **Step 2: Run the smoke runner and confirm it fails before the missing handoff pieces are added**

Run: `npm run smoke:demo`

- [ ] **Step 3: Add README, ASCII Windows launcher, port registration and concise long-term project memory**

```text
scripts/start.cmd installs dependencies when node_modules is absent, copies .env.example when .env is absent, starts port 3013, and opens http://127.0.0.1:3013.
```

- [ ] **Step 4: Run fresh full verification**

Run: `npm test && npm run typecheck && npm run smoke:demo`

- [ ] **Step 5: Inspect status and commit the verified deliverable**

```bash
git status --short
git add README.md scripts
git commit -m "docs: deliver jingke replication workspace"
```

`PORTS.md` 和 Codex 长期记忆位于仓库外，使用 `apply_patch` 单独维护，不纳入本项目 Git 提交。
