# Reference Copy Imitation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Automatically transcribe the reference video's Chinese speech locally and generate editable new-product copy that closely follows the original wording structure while treating new product facts as absolute constraints.

**Architecture:** Decode the reference video's audio to in-memory 16 kHz mono PCM, transcribe it with a lazily loaded local Transformers.js Whisper pipeline, and align timestamped chunks to the existing speech segments. Pass the aligned reference transcript to DeepSeek for structure-aware rewriting, persist both original and rewritten lines, and add a pre-payment script editing API and comparison UI.

**Tech Stack:** Node.js 22, TypeScript, FFmpeg, `@huggingface/transformers`, ONNX Whisper, DeepSeek Chat Completions, Hono, vanilla HTML/CSS/JS, Vitest.

## Global Constraints

- New product facts and forbidden claims always outrank the reference transcript.
- Preserve the original opening pattern, sentence length, tone, selling-point order, pauses, and call-to-action rhythm without copying complete sentences verbatim.
- Decode reference audio only in memory; do not create MP3/WAV files or upload decoded audio.
- Keep Seedance `audioUrls=[]` and `generateAudio=true`.
- Use `onnx-community/whisper-small` by default and allow `WHISPER_MODEL` override.
- Existing projects without `referenceTranscript` must continue to load.
- ASR or DeepSeek failure must degrade to the existing product-fact copy instead of failing project analysis.
- Script edits are allowed only in `READY_TO_CONFIRM` and must preserve IDs and timestamps.
- Do not submit a real paid video task during verification.

---

### Task 1: Transcript Types and Timeline Alignment

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/transcript.ts`
- Create: `tests/transcript.test.ts`

**Interfaces:**
- Consumes: existing `SpeechSegment` values from FFmpeg silence detection.
- Produces: `ReferenceTranscriptSegment` and `alignTranscriptToSpeech(chunks, speechSegments)` for Tasks 2 and 3.

- [x] **Step 1: Write the failing alignment tests**

Create `tests/transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alignTranscriptToSpeech } from '../src/core/transcript.js';

describe('alignTranscriptToSpeech', () => {
  it('assigns each Whisper chunk to the speech segment with the largest overlap', () => {
    const result = alignTranscriptToSpeech([
      { id: 'chunk-1', start: 0.2, end: 2, text: '姐妹们看这里' },
      { id: 'chunk-2', start: 2, end: 4, text: '这件长袖很显瘦' },
      { id: 'chunk-3', start: 5, end: 8, text: '今天价格很划算' }
    ], [
      { id: 'speech-1', start: 0, end: 4 },
      { id: 'speech-2', start: 4.8, end: 8.2 }
    ]);

    expect(result).toEqual([
      { id: 'speech-1', start: 0, end: 4, text: '姐妹们看这里这件长袖很显瘦' },
      { id: 'speech-2', start: 4.8, end: 8.2, text: '今天价格很划算' }
    ]);
  });

  it('returns one empty transcript row per speech segment when Whisper has no chunks', () => {
    expect(alignTranscriptToSpeech([], [{ id: 'speech-1', start: 1, end: 3 }])).toEqual([
      { id: 'speech-1', start: 1, end: 3, text: '' }
    ]);
  });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/transcript.test.ts`

Expected: FAIL because `src/core/transcript.ts` does not exist.

- [x] **Step 3: Add the transcript type and alignment implementation**

Add to `src/core/types.ts`:

```ts
export interface ReferenceTranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}
```

Add optional compatibility storage to `ProjectAnalysis`:

```ts
referenceTranscript?: ReferenceTranscriptSegment[];
```

Create `src/core/transcript.ts` with a largest-overlap assignment. Normalize whitespace with `text.replace(/\s+/g, ' ').trim()` and concatenate Chinese chunks without inserting a space. Return exactly one row for every `SpeechSegment`, using its ID and timestamps.

- [x] **Step 4: Run the focused test and typecheck**

Run: `npm test -- tests/transcript.test.ts && npm run typecheck`

Expected: 2 tests pass and TypeScript exits 0.

- [x] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/transcript.ts tests/transcript.test.ts
git commit -m "feat: align reference transcript to speech timing"
```

---

### Task 2: In-Memory PCM Decoder and Local Whisper Provider

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/media/audio-pcm.ts`
- Create: `src/providers/local-whisper-transcriber.ts`
- Create: `tests/audio-pcm.test.ts`
- Create: `tests/local-whisper-transcriber.test.ts`

**Interfaces:**
- Consumes: a local reference video path, FFmpeg executable path, and configurable Hugging Face model name.
- Produces: `decodeAudioToFloat32(filePath, ffmpegPath)`, `LocalWhisperTranscriber.transcribe(filePath)` returning timestamped `ReferenceTranscriptSegment[]`, and `LocalWhisperTranscriber.dispose()` for process shutdown.

- [x] **Step 1: Write a failing real FFmpeg PCM test**

Create `tests/audio-pcm.test.ts`. Generate a 0.25-second sine-wave WAV in a temporary directory using `execFile`, call `decodeAudioToFloat32`, and assert the result is a `Float32Array` with 3,900–4,100 samples and at least one non-zero sample. Remove the temporary directory in `finally`.

The production change that makes this test pass is the new `decodeAudioToFloat32` export; no disk audio output is created by that function.

- [x] **Step 2: Write the failing provider test**

Create `tests/local-whisper-transcriber.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LocalWhisperTranscriber } from '../src/providers/local-whisper-transcriber.js';

describe('LocalWhisperTranscriber', () => {
  it('loads one Chinese timestamped ASR pipeline and maps chunks', async () => {
    let factoryCalls = 0;
    let receivedOptions: Record<string, unknown> | undefined;
    const transcriber = new LocalWhisperTranscriber(
      { model: 'onnx-community/whisper-small', ffmpegPath: 'ffmpeg' },
      async () => new Float32Array([0, 0.1, -0.1]),
      async () => {
        factoryCalls += 1;
        return async (_audio, options) => {
          receivedOptions = options;
          return {
            text: '姐妹们这件长袖很显瘦',
            chunks: [{ text: '姐妹们这件长袖很显瘦', timestamp: [0.2, 3.8] }]
          };
        };
      }
    );

    const first = await transcriber.transcribe('reference.mp4');
    const second = await transcriber.transcribe('reference.mp4');

    expect(first).toEqual([{ id: 'chunk-1', start: 0.2, end: 3.8, text: '姐妹们这件长袖很显瘦' }]);
    expect(second).toEqual(first);
    expect(factoryCalls).toBe(1);
    expect(receivedOptions).toEqual(expect.objectContaining({
      language: 'zh', task: 'transcribe', return_timestamps: true
    }));
  });

  it('disposes the loaded pipeline during application shutdown', async () => {
    let disposed = 0;
    const transcriber = new LocalWhisperTranscriber(
      { model: 'onnx-community/whisper-small', ffmpegPath: 'ffmpeg' },
      async () => new Float32Array([0, 0.1]),
      async () => Object.assign(
        async () => ({ text: '测试', chunks: [{ text: '测试', timestamp: [0, 1] }] }),
        { dispose: async () => { disposed += 1; } }
      )
    );

    await transcriber.transcribe('reference.mp4');
    await transcriber.dispose();

    expect(disposed).toBe(1);
  });
});
```

- [x] **Step 3: Run both tests and verify RED**

Run: `npm test -- tests/audio-pcm.test.ts tests/local-whisper-transcriber.test.ts`

Expected: FAIL because both production modules are missing.

- [x] **Step 4: Install Transformers.js and implement PCM decoding**

Run: `npm install @huggingface/transformers`

Implement `decodeAudioToFloat32` with `spawn(ffmpegPath, ['-v', 'error', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'])`. Collect stdout buffers, reject on non-zero exit with a bounded stderr message, reject empty output, and convert a byte-aligned copy into `Float32Array` values using `Buffer.readFloatLE` so non-zero `byteOffset` values cannot corrupt samples.

- [x] **Step 5: Implement the lazy local Whisper provider**

Create `LocalWhisperTranscriber` with injectable decoder and pipeline factory. The default factory dynamically imports `@huggingface/transformers` and calls:

```ts
pipeline('automatic-speech-recognition', model, { dtype: 'q4' })
```

Call the pipeline with Chinese transcription, timestamps, `chunk_length_s: 30`, and `stride_length_s: 5`. Convert finite `[start, end]` timestamps into `chunk-N` rows, trim text, discard empty rows, and cache the pipeline promise on the instance. Add `dispose()` that waits for an already-created pipeline, calls its `dispose()` exactly once, and clears the cached promise.

- [x] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/audio-pcm.test.ts tests/local-whisper-transcriber.test.ts && npm run typecheck`

Expected: 2 test files pass and TypeScript exits 0 without downloading the real Whisper model.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json src/media/audio-pcm.ts src/providers/local-whisper-transcriber.ts tests/audio-pcm.test.ts tests/local-whisper-transcriber.test.ts
git commit -m "feat: add local Whisper reference transcription"
```

---

### Task 3: Project Analysis and DeepSeek Structure-Aware Rewriting

**Files:**
- Modify: `src/services/project-service.ts`
- Modify: `src/providers/deepseek-analyzer.ts`
- Modify: `src/core/prompts.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`
- Modify: `.env.example`
- Modify: `tests/project-service.test.ts`
- Modify: `tests/deepseek-analyzer.test.ts`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Consumes: `ReferenceTranscriber.transcribe(filePath)` and `alignTranscriptToSpeech` from Tasks 1–2.
- Produces: persisted `analysis.referenceTranscript`, a DeepSeek prompt containing original lines and product facts, and runtime ASR configuration.

- [x] **Step 1: Write the failing ProjectService integration tests**

Add a `ReferenceTranscriber` fake that returns:

```ts
[{ id: 'chunk-1', start: 0.5, end: 4, text: '姐妹们这件长袖真的很显瘦' }]
```

Assert the analyzer receives an aligned `referenceTranscript`, and the saved project contains it. Add a second test whose transcriber throws `new Error('模型下载失败')`; assert analysis still reaches `READY_TO_CONFIRM` and warnings contain `本地台词转写降级：模型下载失败`.

- [x] **Step 2: Write the failing DeepSeek prompt test**

Extend `analysisInput()` in `tests/deepseek-analyzer.test.ts` with the aligned original line. Assert serialized messages contain all of:

```ts
expect(serializedMessages).toContain('姐妹们这件长袖真的很显瘦');
expect(serializedMessages).toContain('棉麻短袖套装');
expect(serializedMessages).toContain('商品事实优先级最高');
expect(serializedMessages).toContain('模仿句式');
```

Keep the existing assertions that no image path or `image_url` is sent.

- [x] **Step 3: Write the failing config test**

Assert `loadConfig({})` returns:

```ts
asr: { enabled: true, model: 'onnx-community/whisper-small' }
```

and `loadConfig({ LOCAL_ASR_ENABLED: 'false', WHISPER_MODEL: 'local/model' })` returns disabled ASR with the configured model.

- [x] **Step 4: Run the focused tests and verify RED**

Run: `npm test -- tests/project-service.test.ts tests/deepseek-analyzer.test.ts tests/config.test.ts`

Expected: FAIL because transcript input, persistence, prompt rules, and ASR config do not exist.

- [x] **Step 5: Integrate transcription with graceful degradation**

Add this dependency interface to `project-service.ts`:

```ts
export interface ReferenceTranscriber {
  transcribe(filePath: string): Promise<ReferenceTranscriptSegment[]>;
}
```

Add optional `transcriber` to `ProjectServiceDependencies`. For videos with audio, call it during analysis, catch its error into the warnings list, align successful chunks after speech detection, and treat an all-empty result as `本地台词转写降级：未识别到有效台词`. Always store `referenceTranscript`, including an empty array on degradation. Pass it to the analyzer.

- [x] **Step 6: Strengthen the DeepSeek rewrite prompt**

Extend `ProjectAnalyzer` input and `buildCopyPrompt` input with `referenceTranscript`. Serialize only `{ start, end, text }`. Add explicit instructions that product facts have highest priority, each output line must imitate the corresponding original line's sentence pattern and sales rhythm, and unsupported product attributes must be removed rather than guessed. Keep server-side timestamp replacement and forbidden-claim validation unchanged.

- [x] **Step 7: Wire runtime configuration**

Add `LOCAL_ASR_ENABLED` through the existing boolean parser and `WHISPER_MODEL` default. Add `asr` to `AppConfig`. In `src/index.ts`, create one `LocalWhisperTranscriber` when ASR is enabled and pass it to `ProjectService`. Register `SIGINT` and `SIGTERM` handlers that stop the worker, dispose the transcriber, close the HTTP server, and then exit. Add both variables to `.env.example` without credentials.

- [x] **Step 8: Run focused tests and typecheck**

Run: `npm test -- tests/project-service.test.ts tests/deepseek-analyzer.test.ts tests/config.test.ts && npm run typecheck`

Expected: all focused tests pass and TypeScript exits 0.

- [x] **Step 9: Commit**

```bash
git add src/services/project-service.ts src/providers/deepseek-analyzer.ts src/core/prompts.ts src/config.ts src/index.ts .env.example tests/project-service.test.ts tests/deepseek-analyzer.test.ts tests/config.test.ts
git commit -m "feat: imitate reference copy with product-safe rewriting"
```

---

### Task 4: Editable Pre-Payment Script API

**Files:**
- Modify: `src/services/project-service.ts`
- Modify: `src/routes/projects.ts`
- Modify: `tests/project-service.test.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes: `{ lines: Array<{ id: string; text: string }> }` from the browser.
- Produces: `ProjectService.updateScript(projectId, lines)` and `PATCH /api/projects/:id/script`.

- [x] **Step 1: Write failing service validation tests**

For a `READY_TO_CONFIRM` project with two script lines, verify:

- Reversed or missing IDs are rejected with `口播段落必须与分析结果一一对应`.
- Blank text is rejected with `口播不能为空`.
- Text containing a configured forbidden claim is rejected with `新口播包含禁止表达`.
- Valid text updates only `text`, preserving each existing ID, start, end, and source.
- A project in `GENERATING` is rejected with `仅可在生成前修改口播`.

- [x] **Step 2: Write the failing API test**

Call:

```ts
await app.request(`/api/projects/${project.id}/script`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lines: [{ id: 'line-1', text: '这件短袖穿起来清爽透气' }] })
});
```

Assert status 200 and the returned script text is updated. Add a malformed-body case expecting 422.

- [x] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/project-service.test.ts tests/api.test.ts`

Expected: FAIL because `updateScript` and the PATCH route do not exist.

- [x] **Step 4: Implement service validation and persistence**

Implement `updateScript` as an exact ID-order mapping over the saved analysis script. Trim text, reject invalid input before mutating the project, preserve timing, update `updatedAt`, and save only after all lines pass.

- [x] **Step 5: Implement the PATCH route**

Parse JSON with a local Zod schema:

```ts
z.object({ lines: z.array(z.object({ id: z.string().min(1), text: z.string() })).min(1) })
```

Convert parse failures to `HttpError('新口播参数无效', 422)` and return the normal `presentProject` shape.

- [x] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/project-service.test.ts tests/api.test.ts && npm run typecheck`

Expected: all focused tests pass and TypeScript exits 0.

- [x] **Step 7: Commit**

```bash
git add src/services/project-service.ts src/routes/projects.ts tests/project-service.test.ts tests/api.test.ts
git commit -m "feat: edit rewritten copy before generation"
```

---

### Task 5: Original/New Copy Comparison and Dirty-State UI

**Files:**
- Create: `public/script-editor.js`
- Create: `public/script-editor.d.ts`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `src/app.ts`
- Create: `tests/script-editor.test.ts`
- Modify: `tests/frontend.test.ts`

**Interfaces:**
- Consumes: optional `analysis.referenceTranscript` and the PATCH endpoint from Task 4.
- Produces: `buildScriptEditorState(script, referenceTranscript, drafts)`, a two-column transcript editor, and separate save and paid-confirm actions.

- [x] **Step 1: Write the failing script editor behavior tests**

Create `tests/script-editor.test.ts` and assert the real pure state builder:

```ts
import { describe, expect, it } from 'vitest';
import { buildScriptEditorState } from '../public/script-editor.js';

describe('buildScriptEditorState', () => {
  it('aligns original and rewritten lines while blocking confirmation for unsaved drafts', () => {
    const state = buildScriptEditorState(
      [{ id: 'line-1', start: 0, end: 4, text: '这件短袖清爽透气' }],
      [{ id: 'speech-1', start: 0, end: 4, text: '这件长袖遮肉显瘦' }],
      { 'line-1': '这件短袖特别清爽' }
    );

    expect(state.rows).toEqual([{
      id: 'line-1', start: 0, end: 4,
      originalText: '这件长袖遮肉显瘦',
      savedText: '这件短袖清爽透气',
      draftText: '这件短袖特别清爽'
    }]);
    expect(state.dirty).toBe(true);
    expect(state.canConfirm).toBe(false);
    expect(state.payload).toEqual({ lines: [{ id: 'line-1', text: '这件短袖特别清爽' }] });
  });

  it('uses an empty original line and allows confirmation when no draft changed', () => {
    const state = buildScriptEditorState(
      [{ id: 'line-1', start: 0, end: 4, text: '新商品口播' }],
      [],
      {}
    );

    expect(state.rows[0]?.originalText).toBe('');
    expect(state.dirty).toBe(false);
    expect(state.canConfirm).toBe(true);
  });
});
```

Extend `tests/frontend.test.ts` only at the HTTP boundary: assert `/script-editor.js` returns 200 with a JavaScript content type. Do not assert source-code strings.

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/script-editor.test.ts tests/frontend.test.ts`

Expected: FAIL because `public/script-editor.js` and its static route do not exist.

- [x] **Step 3: Render aligned original and editable new lines**

Create the pure module and declaration file, serve it from `src/app.ts`, and import it from `public/app.js`. In `confirmView`, call `buildScriptEditorState(analysis.script, analysis.referenceTranscript || [], state.scriptDrafts)`, render the original text as read-only, and render each new line in a textarea with `data-script-line-id`. If the original row is empty, show `未能取得参考台词`.

Add `state.scriptDirty = false`. On textarea input, set it true, enable the save button, and disable the `confirm-generate` button. Do not rerender during typing.

- [x] **Step 4: Add save and confirmation guards**

The `save-script` action collects line IDs and textarea values, calls `PATCH /api/projects/:id/script`, replaces `state.current` with the returned project, clears dirty state, and displays `新台词已保存`. If `confirm-generate` is clicked while dirty, show `有未保存的新台词，请先保存` and do not call either paid route.

Reset dirty state when opening a different project and after a successful save.

- [x] **Step 5: Add responsive styling**

Use a shared time column plus two copy columns on desktop and stack original/new text under the time on narrow screens. Keep textareas visibly editable, preserve the existing warm neutral palette, and use the existing button styles.

- [x] **Step 6: Run frontend tests and JavaScript syntax validation**

Run: `npm test -- tests/script-editor.test.ts tests/frontend.test.ts && node --check public/script-editor.js && node --check public/app.js`

Expected: frontend tests pass and syntax validation exits 0.

- [x] **Step 7: Commit**

```bash
git add public/script-editor.js public/script-editor.d.ts public/app.js public/styles.css src/app.ts tests/script-editor.test.ts tests/frontend.test.ts
git commit -m "feat: compare and edit imitated product copy"
```

---

### Task 6: Documentation, Full Verification, and Live Restart

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-13-reference-copy-imitation.md`
- Modify outside repository: `E:/AI/AI项目/obstian/Codex/projects/jingke-live-commerce-replica.md`

**Interfaces:**
- Consumes: the complete transcript-aware pipeline from Tasks 1–5.
- Produces: operator documentation, verified local delivery, and secret-free long-term project memory.

- [x] **Step 1: Document first-run and privacy behavior**

Update README with:

- `LOCAL_ASR_ENABLED=true` and `WHISPER_MODEL=onnx-community/whisper-small`.
- First analysis downloads and caches the local Whisper model and can take longer.
- Reference audio is decoded only in memory and never uploaded or saved.
- The confirmation page supports original/new line comparison and editing.
- New projects or re-analysis use this behavior; existing completed analyses are unchanged.

- [x] **Step 2: Run full fresh verification**

Run:

```bash
npm test
npm run typecheck
npm run smoke:demo
git diff --check
```

Expected: every command exits 0. The smoke demo must remain local and must not submit a paid video task.

- [x] **Step 3: Commit documentation and plan status**

Mark all completed plan checkboxes, then run:

```bash
git add README.md docs/superpowers/plans/2026-08-13-reference-copy-imitation.md
git commit -m "docs: explain local transcript-aware copy flow"
```

- [x] **Step 4: Restart only the verified project process**

Resolve the listener on port 3013, verify its command line contains the current absolute project path, stop only that PID, and start `npm.cmd start` hidden with stdout/stderr redirected under ignored `data/` logs. Do not stop any process whose command line does not match this project.

- [x] **Step 5: Verify live delivery without model download or paid generation**

Verify:

- `GET http://127.0.0.1:3013/api/health` returns `ok: true` and `demoMode: false`.
- `/app.js` returns 200 and contains the copy comparison UI.
- The running listener command line belongs to this project.
- The Git working tree is clean.

Do not start a new project analysis during deployment verification because that would download the Whisper model; the first real user analysis may perform that one-time download.

- [x] **Step 6: Update long-term memory without secrets**

Record the local Whisper model choice, in-memory-only audio decoding, DeepSeek structure-aware rewrite priority, editable comparison UI, and first-run download behavior. Do not record keys, tokens, credentials, cookies, or user media.
