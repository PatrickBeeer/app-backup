# Presenter Modes and DeepSeek Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional model-generated adult presenters for references up to 15 seconds, require uploaded presenter references for longer videos, remove standalone reference audio, and move product-copy generation to the official DeepSeek API.

**Architecture:** Store an explicit presenter mode on each project and enforce the 15-second boundary in both the upload UI and server. Keep local FFmpeg structure/timing analysis, use a focused DeepSeek text analyzer for the new product script, and submit only the reference video plus image assets to Seedance. Preserve deterministic product-fact copy as a safe fallback when DeepSeek is unavailable.

**Tech Stack:** Node.js 22, TypeScript, Hono, Vitest, vanilla browser ESM, FFmpeg/FFprobe, DeepSeek OpenAI-compatible Chat Completions, CPRT Seedance async API.

## Global Constraints

- References of 15 seconds or less produce exactly one Seedance generation unit.
- References longer than 15 seconds require `presenterMode: "reference"` and 3–5 photos of the same clearly adult authorized presenter.
- Generated-presenter mode submits product images only, `realPersonMode: false`, and empty `conversionSlots`.
- Never extract, store, publish, or submit a standalone reference audio file; `audioUrls` is always `[]` and `generateAudio` remains `true`.
- DeepSeek uses `https://api.deepseek.com`, model `deepseek-v4-flash`, JSON Output, and non-thinking mode.
- The DeepSeek secret stays only in ignored `.env`; never put it in source, tests, docs, logs, or commits.
- Tests and smoke checks must not submit a paid video generation request.

---

### Task 1: Persist presenter mode and enforce the 15-second boundary

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/presenter.ts`
- Modify: `src/core/generation-units.ts`
- Modify: `src/routes/projects.ts`
- Modify: `tests/generation-units.test.ts`
- Modify: `tests/api.test.ts`
- Modify: `tests/project-store.test.ts`
- Create: `tests/presenter.test.ts`

**Interfaces:**
- Produces: `type PresenterMode = 'reference' | 'generated'`.
- Produces: `Project.presenterMode?: PresenterMode` for backward-compatible reads and `CreateProjectInput.presenterMode: PresenterMode` for all new writes.
- Produces: `resolvePresenterMode(project: Pick<Project, 'presenterMode' | 'personPhotos'>): PresenterMode`, mapping old projects with photos to `reference` and old projects without photos to `generated`.

- [ ] **Step 1: Write failing unit and API tests**

Add literal expectations:

```ts
it('keeps a 10-second multi-shot reference in one generation unit', () => {
  const units = buildGenerationUnits(shots([[0, 1.8], [1.8, 4.2], [4.2, 7.5], [7.5, 10]]), 10);
  expect(units.map((unit) => [unit.start, unit.end, unit.requestDuration])).toEqual([[0, 10, 10]]);
});

it('accepts generated presenter mode without person photos for a 15-second reference', async () => {
  const body = form();
  body.set('presenterMode', 'generated');
  body.delete('personPhotos');
  const { app, store } = setup(15);
  const response = await app.request('/api/projects', { method: 'POST', body });
  expect(response.status).toBe(201);
  expect(store.listProjects()[0]).toEqual(expect.objectContaining({ presenterMode: 'generated', personPhotos: [] }));
});

it('rejects generated presenter mode for a reference longer than 15 seconds', async () => {
  const body = form();
  body.set('presenterMode', 'generated');
  body.delete('personPhotos');
  const { app, store } = setup(15.001);
  const response = await app.request('/api/projects', { method: 'POST', body });
  expect(response.status).toBe(422);
  expect(store.listProjects()).toHaveLength(0);
});
```

Add API coverage that `reference` still requires 3–5 photos and store coverage that presenter mode survives persistence.

- [ ] **Step 2: Run tests and verify the intended failures**

Run: `npm test -- tests/generation-units.test.ts tests/api.test.ts tests/project-store.test.ts tests/presenter.test.ts`

Expected: FAIL because a 10-second reference is split at 4.2 seconds, `presenterMode` is not parsed, and zero person photos are rejected unconditionally.

- [ ] **Step 3: Implement the presenter-mode data contract and server validation**

Add the exact type contract:

```ts
export type PresenterMode = 'reference' | 'generated';

// Add this property to CreateProjectInput:
presenterMode: PresenterMode;

// Add this property to Project for backward-compatible stored records:
presenterMode?: PresenterMode;
```

Implement `resolvePresenterMode` and cover explicit plus legacy modes in `tests/presenter.test.ts`. In `buildGenerationUnits`, return one `[0, duration]` unit before evaluating natural shot boundaries when `duration <= 15`. In the project upload route, parse `presenterMode`, probe the uploaded reference, then enforce:

```ts
if (presenterMode === 'reference' && (personPhotos.length < 3 || personPhotos.length > 5)) {
  throw new HttpError('指定模特模式请上传 3–5 张同一位成年人物照片', 422);
}
if (presenterMode === 'generated' && personPhotos.length > 0) {
  throw new HttpError('模型生成人物模式请勿上传人物照片', 422);
}
if (presenterMode === 'generated' && probe.duration > 15) {
  throw new HttpError('参考视频超过 15 秒，为保持分段人物一致性，请上传 3–5 张指定模特照片', 422);
}
```

Only save person files after these checks pass. Include `presenterMode` in the new project input.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/generation-units.test.ts tests/api.test.ts tests/project-store.test.ts tests/presenter.test.ts && npm run typecheck`

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/core/types.ts src/core/presenter.ts src/core/generation-units.ts src/routes/projects.ts tests/generation-units.test.ts tests/api.test.ts tests/project-store.test.ts tests/presenter.test.ts
git commit -m "feat: add duration-aware presenter modes"
```

---

### Task 2: Remove standalone audio and make Seedance requests presenter-aware

**Files:**
- Modify: `src/services/project-service.ts`
- Modify: `src/services/job-worker.ts`
- Modify: `src/providers/cprt.ts`
- Modify: `src/core/prompts.ts`
- Modify: `tests/project-service.test.ts`
- Modify: `tests/job-worker.test.ts`
- Modify: `tests/cprt.test.ts`
- Modify: `tests/prompts.test.ts`

**Interfaces:**
- Consumes: `Project.presenterMode?: PresenterMode` from Task 1.
- Changes: `MultimodalPayloadInput` no longer accepts `referenceAudioUrl`.
- Produces: `buildMultimodalPayload` with `audioUrls: []`, conditional `realPersonMode`, and conditional `conversionSlots`.

- [ ] **Step 1: Write failing tests for the request boundary**

Change the CPRT contract expectation to:

```ts
expect(body.audioUrls).toEqual([]);
```

Add a generated-presenter payload test:

```ts
const body = buildMultimodalPayload({
  presenterMode: 'generated',
  personUrls: [],
  productUrls: ['sku1'],
  referenceVideoUrl: 'reference.mp4',
  prompt: 'new short-sleeve script',
  ratio: '9:16',
  requestDuration: 12
});
expect(body).toEqual(expect.objectContaining({
  imageUrls: ['sku1'], audioUrls: [], realPersonMode: false, conversionSlots: []
}));
```

Change project analysis tests so `extractReferenceAudio` counts calls and the expected count is zero, and all generation units have no `referenceAudio`. Add prompt assertions for both presenter modes and the exact restriction `参考台词只能用于语速、停顿和情绪参考`.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- tests/project-service.test.ts tests/job-worker.test.ts tests/cprt.test.ts tests/prompts.test.ts`

Expected: FAIL because MP3 extraction and upload still occur, payloads include reference audio, and presenter behavior is unconditional.

- [ ] **Step 3: Implement the minimal request changes**

Remove the audio-extraction call from `ProjectService.analyze`. Remove reference-audio publishing from `JobWorker.submitRemote`. Extend `MultimodalPayloadInput` with `presenterMode: PresenterMode`, then build:

```ts
const usesReferencePresenter = input.presenterMode === 'reference';
const personSlots = input.personUrls.map((_, index) => `image${index + 1}`);
return {
  model: input.model ?? 'free-video-2.0-multimodal-video',
  prompt: input.prompt,
  resolution: '720p',
  duration: clampDuration(input.requestDuration),
  imageUrls: [...input.personUrls, ...input.productUrls],
  videoUrls: [input.referenceVideoUrl],
  audioUrls: [],
  generateAudio: true,
  ratio: input.ratio,
  realPersonMode: usesReferencePresenter,
  conversionSlots: usesReferencePresenter ? personSlots : [],
  returnLastFrame: true,
  seed: -1
};
```

Resolve legacy projects with the Task 1 helper:

```ts
const presenterMode = resolvePresenterMode(project);
```

Branch `buildUnitPrompt`: reference mode locks identity to uploaded photos; generated mode requests a clearly adult presenter aligned to the product and explicitly forbids copying the reference person's identity. In both modes, state that reference speech is pacing-only and the quoted new script must be spoken verbatim.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- tests/project-service.test.ts tests/job-worker.test.ts tests/cprt.test.ts tests/prompts.test.ts && npm run typecheck`

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/services/project-service.ts src/services/job-worker.ts src/providers/cprt.ts src/core/prompts.ts tests/project-service.test.ts tests/job-worker.test.ts tests/cprt.test.ts tests/prompts.test.ts
git commit -m "feat: generate without standalone reference audio"
```

---

### Task 3: Replace CPRT script analysis with DeepSeek

**Files:**
- Create: `src/providers/deepseek-analyzer.ts`
- Create: `tests/deepseek-analyzer.test.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Modify: `src/core/prompts.ts`
- Modify: `tests/project-service.test.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Local-only modify: `.env` (ignored, never stage)

**Interfaces:**
- Produces: `DeepSeekAnalyzer implements ProjectAnalyzer`.
- Produces config: `deepseek: { baseUrl: string; apiKey?: string; model: string }`.
- Uses: `POST ${baseUrl}/chat/completions` with `response_format: { type: 'json_object' }`, `thinking: { type: 'disabled' }`, and `model: deepseek-v4-flash`.

- [ ] **Step 1: Write failing DeepSeek contract tests**

Create a fake-fetch test that captures the request and returns:

```json
{
  "choices": [{
    "message": {
      "content": "{\"summary\":\"短袖套装口播\",\"script\":[{\"start\":0,\"end\":4,\"text\":\"这款短袖棉麻套装穿起来很透气\"}],\"warnings\":[]}"
    }
  }]
}
```

Assert the returned line source is `llm`, and assert the request literal includes the product's `短袖` fact, JSON Output, non-thinking mode, and no image content. Add one test where the first fetch returns 503 and the second succeeds; assert the final analysis succeeds after exactly two HTTP calls.

- [ ] **Step 2: Run the new test and verify it fails**

Run: `npm test -- tests/deepseek-analyzer.test.ts`

Expected: FAIL because `src/providers/deepseek-analyzer.ts` does not exist.

- [ ] **Step 3: Implement `DeepSeekAnalyzer`**

Create a focused text-only analyzer with a Zod response schema for `summary`, `script`, and `warnings`. Build the request as:

```ts
body: JSON.stringify({
  model: this.config.model,
  messages: [
    { role: 'system', content: '你是商品短视频口播改写器，只输出 JSON。' },
    { role: 'user', content: prompt }
  ],
  response_format: { type: 'json_object' },
  thinking: { type: 'disabled' }
})
```

Retry once only for status 429 or 5xx. Return empty `overlays` because this provider is text-only. Reject responses whose script count or timing contract is invalid so `ProjectService` falls back to deterministic product-fact copy.

- [ ] **Step 4: Wire config and runtime without exposing secrets**

Add environment defaults:

```ts
DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
DEEPSEEK_API_KEY: z.string().optional(),
DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash')
```

Instantiate `DeepSeekAnalyzer` in real mode when `DEEPSEEK_API_KEY` is set. Add empty variables to `.env.example` and document them in `README.md`. Update ignored `.env` locally with the user-provided key using a non-echoing edit, verify only that the value is non-empty, and never run `git add .env`.

- [ ] **Step 5: Run analyzer, service, config tests and typecheck**

Run: `npm test -- tests/deepseek-analyzer.test.ts tests/project-service.test.ts tests/api.test.ts && npm run typecheck`

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/providers/deepseek-analyzer.ts tests/deepseek-analyzer.test.ts src/config.ts src/index.ts src/core/prompts.ts tests/project-service.test.ts .env.example README.md
git commit -m "feat: generate product copy with DeepSeek"
```

---

### Task 4: Add the presenter-mode upload interaction and verify delivery

**Files:**
- Create: `public/presenter-form.js`
- Create: `tests/presenter-form.test.ts`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `src/app.ts`
- Modify: `tests/frontend.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `presenterFormState(duration: number | undefined, requestedMode: 'reference' | 'generated')` returning `{ mode, forced, requiresPhotos, message }`.
- Consumes: upload API field `presenterMode` from Task 1.

- [ ] **Step 1: Write failing pure interaction tests**

```ts
import { presenterFormState } from '../public/presenter-form.js';

expect(presenterFormState(15, 'generated')).toEqual({
  mode: 'generated', forced: false, requiresPhotos: false,
  message: '模型将自动生成一位明确成年的带货人物'
});
expect(presenterFormState(15.001, 'generated')).toEqual({
  mode: 'reference', forced: true, requiresPhotos: true,
  message: '视频超过 15 秒，需要指定模特以保持分段人物一致'
});
```

Add a frontend route test asserting `/presenter-form.js` returns JavaScript successfully.

- [ ] **Step 2: Run frontend tests and verify failure**

Run: `npm test -- tests/presenter-form.test.ts tests/frontend.test.ts`

Expected: FAIL because the presenter form module and route do not exist.

- [ ] **Step 3: Implement the browser interaction**

Create the pure helper, serve it from `src/app.ts`, import it from `public/app.js`, and add two radio-card choices: `使用指定模特` and `由模型生成人物`. Read selected video metadata with a temporary `<video>` object, then apply the helper result. When forced, set `reference`, disable the generated choice, reveal the photo uploader, and show the exact reason. When generated, disable the person file input so FormData contains no person files.

Update submit validation:

```js
const presenterMode = form.querySelector('[name="presenterMode"]:checked').value;
if (presenterMode === 'reference' && (personCount < 3 || personCount > 5)) {
  return toast('指定模特模式请上传 3–5 张人物照片', true);
}
```

Add focused CSS for the mode cards, forced-state explanation, and hidden uploader without changing the rest of the visual system.

- [ ] **Step 4: Run frontend tests and syntax check**

Run: `npm test -- tests/presenter-form.test.ts tests/frontend.test.ts && node --check public/app.js && node --check public/presenter-form.js`

Expected: all selected tests PASS and both JavaScript checks exit 0.

- [ ] **Step 5: Run full verification and inspect the live API**

Run:

```powershell
npm test
npm run typecheck
npm run smoke:demo
git diff --check
```

Restart only the Node process listening on port 3013 after verifying its command line belongs to this project. Check `/api/health`, confirm real mode, fetch `/app.js` and `/presenter-form.js`, and confirm the worktree contains no staged or tracked `.env`.

- [ ] **Step 6: Commit Task 4**

```powershell
git add public/presenter-form.js tests/presenter-form.test.ts public/app.js public/styles.css src/app.ts tests/frontend.test.ts README.md
git commit -m "feat: add optional generated presenter workflow"
```

- [ ] **Step 7: Record durable project memory**

Update `E:/AI/AI项目/obstian/Codex/projects/jingke-live-commerce-replica.md` with the 15-second presenter rule, no-standalone-audio decision, and DeepSeek provider/model. Do not record any credential.
