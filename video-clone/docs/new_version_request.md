# Video Clone In-House Migration Plan

## What the app does today

- The frontend calls the local app BFF at `server/server.ts` through `/standalone/video-clone/api/run`.
- The clone pipeline in the BFF still uses DENS:
  - video: `createCloneVideoTask` / `getCloneVideoTask` in `server/dens.ts`
  - speech: `createCloneSpeechTask` / `getCloneSpeechTask` in `server/dens.ts`
- Media processing is already local to the app BFF:
  - extract reference audio: `server/media.ts`
  - merge generated video + converted audio: `server/media.ts`
- COS upload capability already exists in this repo and is already used by the app frontend:
  - `createPresignedCOSUpload`
  - `uploadAssetToCOSWithPresignedURL`
  - current usage is in `App.tsx` and `services/geminiService.ts`

## Recommended direction

Start by replacing only the **video provider layer** inside the BFF:

- keep the current frontend request shape
- keep the current BFF endpoints:
  - `start_clone_job`
  - `get_clone_job`
- keep COS upload/publish flow as-is
- replace only:
  - `DENS Kling video create`
  - `DENS Kling video poll`

That gives us the smallest safe Phase 1:

- Kling 3.0 Omni becomes direct and app-contained
- ElevenLabs work is explicitly suspended for now
- add a placeholder speech-provider seam so ElevenLabs can be plugged in later
- the UI does not need a large rewrite

## Why this is the right first step

The current BFF already has the correct responsibilities:

- receives one app-specific clone request
- extracts reference audio locally
- polls provider tasks
- merges the final video locally
- returns one final job status to the UI

So we do not need a new backend. We only need to replace the provider adapter under `server/`.

## Phase 1 target architecture

1. Frontend uploads assets to COS using the existing presign flow.
2. Frontend sends COS/public URLs to the local BFF.
3. BFF submits a direct Kling 3.0 Omni task.
4. BFF polls Kling task status directly.
5. When Kling video is ready:
   - BFF downloads the generated video
   - BFF merges it with the converted audio
   - BFF uploads the final merged mp4 to COS
6. BFF returns the final COS URL to the frontend.

## Concrete implementation plan

### 1. Split provider code by responsibility

Create a new direct Kling module, for example:

- `server/kling.ts`

Keep `server/dens.ts` only for the parts still on DENS during transition.

Suggested end state:

- `server/kling.ts` for Kling 3.0 Omni direct calls
- `server/elevenlabs.ts` later for direct ElevenLabs calls
- `server/media.ts` unchanged
- `server/server.ts` as orchestration only

### 2. Add direct Kling config

Extend `server/config.ts` with direct provider config:

- `KLING_API_KEY`
- `KLING_BASE_URL` default `https://api-beijing.klingai.com`
- optional `KLING_CALLBACK_URL` later if we want callbacks

Do not remove DENS config yet. We will run hybrid mode during migration.

### 2.5. Suspend ElevenLabs and leave a placeholder

For this phase, ElevenLabs should be treated as **suspended** rather than migrated.

That means:

- do not build the direct ElevenLabs integration yet
- do not spend time refining provider-specific speech logic yet
- keep the current clone pipeline shape compatible with a future speech-provider module

Recommended placeholder approach:

- add a thin speech-provider interface in the BFF
- keep the current implementation behind a temporary placeholder/default adapter
- make it obvious in code comments and naming that speech is deferred work

Example direction:

- `server/kling.ts` -> real implementation now
- `server/speech.ts` -> placeholder module for now
- `server/elevenlabs.ts` -> real implementation later

For the placeholder behavior, choose one of these:

- keep current DENS speech path behind `speech.ts`, but mark it as temporary
- or return a clear "speech temporarily suspended" status if we want to disable voice conversion during Kling rollout

My recommendation is the first option, because it lets the current end-to-end clone flow keep working while still making ElevenLabs migration explicitly out of scope for this pass.

### 3. Implement direct Kling 3.0 Omni submit

In `server/kling.ts`, add something like:

- `createKlingOmniTask(input)`
- `getKlingOmniTask(taskId)`

The request payload should follow the official Omni contract, which is already very close to what `server/dens.ts` is building now:

```json
{
  "contents": [
    { "type": "prompt", "text": "..." },
    { "type": "refer_image", "url": "..." , "id": "image_1" },
    { "type": "feature_video", "url": "..." , "id": "video_1" }
  ],
  "settings": {
    "resolution": "720p",
    "duration": 5,
    "audio": "off",
    "multi_shot": false,
    "aspect_ratio": "9:16"
  },
  "options": {
    "external_task_id": "..."
  }
}
```

Submit endpoint:

- `POST /omni-video/kling-3.0-omni`

Auth:

- `Authorization: Bearer ${KLING_API_KEY}`

### 4. Implement direct Kling polling

For Phase 1, keep polling rather than adding callbacks.

Reason:

- the app already polls every 3s
- the BFF already normalizes job states
- callbacks add extra deployment and auth work

`server/kling.ts` should normalize Kling states into the same app states we already use:

- `submitted` -> `queued`
- `processing` -> `running`
- `succeeded` -> `completed`
- `failed` -> `failed`

Also preserve provider error details so the UI can show a real failure message.

### 5. Rewire clone jobs in `server/server.ts`

Change only the video half of `start_clone_job` and `get_clone_job`.

Today:

- video task comes from `createCloneVideoTask(...)` in `dens.ts`
- video status comes from `getCloneVideoTask(...)` in `dens.ts`

Phase 1:

- video task comes from `createKlingOmniTask(...)` in `kling.ts`
- video status comes from `getKlingOmniTask(...)` in `kling.ts`
- speech stays behind a temporary placeholder adapter for now
- no direct ElevenLabs migration in this phase

This means the clone job record can stay almost unchanged.

## Important detail: COS is already enough for asset delivery

We do not need a Cloudflare tunnel for production.

The app already uploads image/video/audio assets to COS and passes URL-based assets around. That is exactly what Kling needs for:

- `refer_image.url`
- `feature_video.url`

The only thing we need to verify is URL lifetime:

- presigned/public URLs must stay valid long enough for Kling to fetch them

If current URLs are short-lived, we should switch the references used by Kling to a longer-lived public path or longer TTL.

## Suggested code changes

### New file

- `server/kling.ts`

### Update

- `server/config.ts`
- `server/server.ts`

### Keep for now

- `server/dens.ts` for temporary speech placeholder wiring only
- `server/media.ts`
- frontend BFF service contract in `services/videoCloneBffService.ts`

## API shape I would keep stable

Keep this frontend contract unchanged for Phase 1:

- `imageUrl`
- `referenceVideoUrl`
- `sourceAudioUploadUrl`
- `sourceAudioPublicUrl`
- `resultUploadUrl`
- `resultPublicUrl`
- `mergedVideoUploadUrl`
- `mergedVideoPublicUrl`
- `aspectRatio`
- `durationSeconds`
- `resolution`
- `prompt`

That stability matters because it lets us replace the backend provider without touching the UI flow.

## Migration sequence

1. Add `server/kling.ts`
2. Add direct Kling env config
3. Add a temporary speech placeholder seam
4. Swap clone-video create/poll from DENS to direct Kling
5. Verify end-to-end clone flow still works with temporary speech wiring
6. After stable, move ElevenLabs out of placeholder/DENS wiring in a second pass

## Risks to watch

- Kling may reject URLs if COS links expire too early
- Kling result schema may differ from DENS-normalized fields, so we need careful response parsing
- current in-memory job cache is fine for one-node dev/prod, but it is not durable across restarts

## My recommendation

Do this as a **provider-adapter replacement inside the existing BFF**, not as a frontend rewrite and not as a brand new backend.

That gives us:

- the smallest change set
- the fastest path off the external ability server for Kling
- a clean placeholder for the later ElevenLabs migration
