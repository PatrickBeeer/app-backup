# Presenter Photo Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow reference-presenter projects to use 1–5 authorized adult presenter photos instead of requiring 3–5.

**Architecture:** Keep the existing browser and Hono validation layers, changing only the lower boundary and user-facing copy. Protect the new boundary with an API integration test using one real multipart photo and a browser-state unit test; keep generated-presenter behavior and all upper limits unchanged.

**Tech Stack:** Node.js 22, TypeScript, Hono, Vitest, vanilla browser ESM.

## Global Constraints

- Reference-presenter mode accepts exactly 1–5 presenter photos.
- Generated-presenter mode accepts no presenter photos.
- References longer than 15 seconds still force reference-presenter mode, now requiring 1–5 photos.
- Do not add face detection, image-quality detection, or new dependencies.
- Keep the 5-photo upper limit, 30 MB per-image limit, and 1–9 product-image limit unchanged.

---

### Task 1: Change the presenter-photo lower boundary

**Files:**
- Modify: `tests/api.test.ts`
- Modify: `tests/presenter-form.test.ts`
- Modify: `src/routes/projects.ts`
- Modify: `public/presenter-form.js`
- Modify: `public/app.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: multipart field `personPhotos: File[]` and `presenterMode: "reference" | "generated"`.
- Produces: reference-presenter project creation for 1–5 files; HTTP 422 outside that range.
- Produces: browser guidance string `上传 1–5 张同一位成年模特照片`.

- [ ] **Step 1: Write failing boundary tests**

Change the API creation case to submit one literal presenter file and assert success:

```ts
it('creates a reference-presenter draft from one person photo', async () => {
  const { app, store } = setup();
  const body = form();
  body.delete('personPhotos');
  body.append('personPhotos', new File([new Uint8Array([1])], 'person-1.jpg', { type: 'image/jpeg' }));

  const response = await app.request('/api/projects', { method: 'POST', body });

  expect(response.status).toBe(201);
  expect(store.listProjects()[0]?.personPhotos).toHaveLength(1);
});
```

Update the reference-mode form-state expectation to:

```ts
expect(presenterFormState(12, 'reference')).toEqual({
  mode: 'reference',
  forced: false,
  requiresPhotos: true,
  message: '上传 1–5 张同一位成年模特照片'
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/api.test.ts tests/presenter-form.test.ts`

Expected: FAIL because the API returns 422 for one photo and the form-state message still says 3–5.

- [ ] **Step 3: Implement the minimal rule change**

In `src/routes/projects.ts`, change the reference-mode check to:

```ts
if (presenterModeValue === 'reference' && (personPhotos.length < 1 || personPhotos.length > 5)) {
  throw new HttpError('指定模特模式请上传 1–5 张同一位成年人物照片', 422);
}
```

Change the over-15-second generated-mode message to `参考视频超过 15 秒，为保持分段人物一致性，请上传 1–5 张指定模特照片`.

In `public/app.js`, change both upload guidance strings and the submit guard to reject `personCount < 1 || personCount > 5`, with the toast `指定模特模式请上传 1–5 张人物照片`.

In `public/presenter-form.js`, return `上传 1–5 张同一位成年模特照片` for reference mode. Update current-product prose in `README.md` from 3–5 to 1–5 without editing historical plan files.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/api.test.ts tests/presenter-form.test.ts`

Expected: both test files PASS.

- [ ] **Step 5: Verify all project gates**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: TypeScript exits 0.

Run: `npm run smoke:demo`

Expected: the demo workflow reaches its successful completion message without any paid API request.

- [ ] **Step 6: Commit the behavior change**

```powershell
git add README.md public/app.js public/presenter-form.js src/routes/projects.ts tests/api.test.ts tests/presenter-form.test.ts
git commit -m "feat: allow one presenter reference photo"
```

