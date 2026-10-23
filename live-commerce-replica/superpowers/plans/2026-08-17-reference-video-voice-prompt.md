# Reference Video Voice Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the reference video's original voice track and instruct Seedance to use its vocal characteristics while speaking the confirmed new-product script.

**Architecture:** Make the shared FFmpeg generation-unit slicer preserve an optional first audio stream, then have the paid-task worker always rebuild each submitted reference clip from the project's original reference video so already-analyzed muted projects recover their source audio. Keep `audioUrls: []`; the voice travels inside `videoUrls`, while the generation prompt separates vocal-character reference from old spoken semantics.

**Tech Stack:** Node.js 22, TypeScript, Hono, Vitest, FFmpeg/FFprobe, CPRT Seedance 2.0 multimodal video API.

## Global Constraints

- Use only the reference video's own audio track; do not add an independent audio upload.
- Keep CPRT `audioUrls: []`, `generateAudio: true`, and `conversionSlots: ["all"]`.
- Preserve the current 720p, duration, aspect-ratio, presenter-photo, and product-image behavior.
- Existing analyzed projects must rebuild a voice-bearing clip from `Project.referenceVideo` and the unit's original `start`/`duration`.
- Do not add TTS, professional voice cloning, automatic output transcription, or paid verification requests.
- Prompt-only voice reference remains best-effort; human review remains the delivery gate when old copy leaks into a generated candidate.

---

### Task 1: Preserve source audio in generation-unit references

**Files:**
- Modify: `tests/ffmpeg-analysis.test.ts`
- Modify: `tests/job-worker.test.ts`
- Modify: `src/media/ffmpeg.ts`
- Modify: `src/services/job-worker.ts`

**Interfaces:**
- Changes: `sliceGenerationUnit(inputPath, unit, outputPath, ffmpegPath?)` keeps the same signature and emits H.264 video plus the optional first AAC audio stream.
- Changes: `JobWorkerDependencies.prepareReferenceClip` becomes `(inputPath: string, unit: GenerationUnit, outputPath: string) => Promise<string>`.
- Produces: paid multimodal requests publish `<unit-name>-with-audio.mp4`, rebuilt from `project.referenceVideo` using the full unit timeline.

- [ ] **Step 1: Write failing media and worker tests**

Change the FFmpeg integration expectation to require the source audio:

```ts
it('preserves the original audio when creating a reference unit', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'jingke-reference-unit-'));
  const reference = path.join(tempDir, 'reference.mp4');
  const unitPath = path.join(tempDir, 'unit.mp4');
  makeReferenceVideo(reference);

  await sliceGenerationUnit(reference, {
    id: 'unit-1', start: 0, end: 6, duration: 6, requestDuration: 6,
    shotIds: [], scriptLineIds: []
  }, unitPath);

  const unitProbe = await probeVideo(unitPath);
  expect(unitProbe.hasVideo).toBe(true);
  expect(unitProbe.hasAudio).toBe(true);
});
```

In the pending-task worker test, capture the generation unit and require the original project video as input:

```ts
const preparedPaths: Array<{
  inputPath: string;
  unit: { start: number; duration: number };
  outputPath: string;
}> = [];

prepareReferenceClip: async (inputPath, unit, outputPath) => {
  preparedPaths.push({
    inputPath,
    unit: { start: unit.start, duration: unit.duration },
    outputPath
  });
  return outputPath;
}

expect(preparedPaths).toEqual([{
  inputPath: 'reference.mp4',
  unit: { start: 0, duration: 6 },
  outputPath: 'unit-1-with-audio.mp4'
}]);
expect(provider.submittedPayloads[0]).toEqual(expect.objectContaining({
  videoUrls: ['https://media.example/unit-1-with-audio.mp4'],
  audioUrls: []
}));
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/ffmpeg-analysis.test.ts tests/job-worker.test.ts`

Expected: FAIL because the sliced clip has no audio and JobWorker still prepares `unit-1-visual.mp4` from the already-muted `unit-1.mp4`.

- [ ] **Step 3: Preserve optional audio in the FFmpeg slicer**

In `sliceGenerationUnit`, replace `-an` with explicit optional audio mapping and AAC output:

```ts
await run(ffmpegPath, [
  '-y', '-ss', unit.start.toFixed(3), '-i', inputPath, '-t', unit.duration.toFixed(3),
  '-map', '0:v:0', '-map', '0:a:0?',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', outputPath
]);
```

The `?` keeps references without an audio stream valid while excluding unrelated subtitle/data streams.

- [ ] **Step 4: Rebuild paid references from the original project video**

Change the dependency type:

```ts
prepareReferenceClip?: (
  inputPath: string,
  unit: GenerationUnit,
  outputPath: string
) => Promise<string>;
```

In `submitRemote`, replace the visual-reference block with:

```ts
const parsedReference = path.parse(unit.referenceClip);
const voiceReferencePath = path.join(
  parsedReference.dir,
  `${parsedReference.name}-with-audio${parsedReference.ext || '.mp4'}`
);
const prepareReferenceClip = this.deps.prepareReferenceClip
  ?? ((inputPath: string, generationUnit: GenerationUnit, outputPath: string) => sliceGenerationUnit(
    inputPath,
    generationUnit,
    outputPath,
    this.deps.ffmpegPath
  ));
const preparedReferenceClip = await prepareReferenceClip(
  project.referenceVideo,
  unit,
  voiceReferencePath
);
```

Publish `preparedReferenceClip` as the only `videoUrls` item. Do not publish the legacy `referenceAudio` field and do not populate `audioUrls`.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/ffmpeg-analysis.test.ts tests/job-worker.test.ts`

Expected: both files PASS.

Run: `npm run typecheck`

Expected: TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/media/ffmpeg.ts src/services/job-worker.ts tests/ffmpeg-analysis.test.ts tests/job-worker.test.ts
git commit -m "fix: preserve reference video voice audio"
```

---

### Task 2: Constrain Seedance to the reference voice and new script

**Files:**
- Modify: `tests/prompts.test.ts`
- Modify: `src/core/prompts.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `buildUnitPrompt(project, unit)` and the confirmed `Project.analysis.script` timeline.
- Produces: a prompt that requests reference-video vocal characteristics, discards old spoken semantics, and retains exact new-script and product-fact constraints.

- [ ] **Step 1: Write the failing prompt contract**

Add these literal expectations to the reference-presenter prompt test:

```ts
expect(prompt).toContain('使用参考视频中说话人的音色、声线、口音、语气、语速和情绪');
expect(prompt).toContain('完全忽略其文字语义和旧商品信息');
expect(prompt).toContain('必须按下方时间轴逐字朗读新口播');
expect(prompt).not.toContain('不要克隆参考人物的声音');
```

- [ ] **Step 2: Run the prompt test and verify RED**

Run: `npm test -- tests/prompts.test.ts`

Expected: FAIL because the prompt still says `不要克隆参考人物的声音` and does not request the original speaker's vocal characteristics.

- [ ] **Step 3: Replace the voice instruction without weakening product facts**

Keep the visual-reference sentence focused on structure, then replace the audio instruction with:

```ts
'开启自然中文人声和准确口型，并生成匹配参考片情绪的音乐、环境声和音效。使用参考视频中说话人的音色、声线、口音、语气、语速和情绪来朗读新口播。参考视频的原台词只用于声音特征参考，完全忽略其文字语义和旧商品信息。',
'必须按下方时间轴逐字朗读新口播，不得说出参考视频中的商品名、款式、材质、颜色、规格、功效或价格；旧台词与新口播冲突时始终以新口播为准。',
```

Retain the existing image/product-fact priority, forbidden-expression, identity, visual-text, timing, music, ambience, and sound-effect requirements.

- [ ] **Step 4: Update current product documentation**

In `README.md`, replace the muted-visual-reference workflow statement with the current behavior: each submitted reference segment retains its corresponding source audio so Seedance can use vocal characteristics, while the prompt requires the confirmed new script. State explicitly that this is best-effort prompt control rather than guaranteed professional voice cloning.

- [ ] **Step 5: Run focused and full verification**

Run: `npm test -- tests/prompts.test.ts tests/cprt.test.ts`

Expected: both files PASS and the CPRT contract still asserts `audioUrls: []`, `generateAudio: true`, and `conversionSlots: ["all"]`.

Run: `npm test`

Expected: all test files PASS.

Run: `npm run typecheck`

Expected: TypeScript exits 0.

Run: `node --check public/app.js`

Expected: exit 0.

Run: `npm run smoke:demo`

Expected: the isolated demo workflow returns `{ "ok": true }` without a paid API request.

- [ ] **Step 6: Commit Task 2**

```powershell
git add README.md src/core/prompts.ts tests/prompts.test.ts
git commit -m "feat: reference the original video voice"
```
