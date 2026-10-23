# 数字人口播 implementation plan

## OmniHuman 1.5 migration

The original CPRT plan below describes the first release. New video tasks now
submit one portrait and the prepared TTS audio to Volcengine OmniHuman 1.5
(`jimeng_realman_avatar_picture_omni_v15`) in 1080p quality mode. The backend
polls and persists the result before its one-hour URL expires; existing CPRT
jobs keep their legacy polling path. The three CPRT model tiers are removed.
Set `OMNIHUMAN_VIDEO_POINTS_PER_SECOND` to an agreed positive integer before
enabling paid video submission; the app and billed backend use the same
server-side quote. The 4-15-second audio policy and exact-input final track
remain in place. No paid test or production rollout is part of this migration
until the point price is approved.

## Goal

Build an independent `speech-video` standalone app. Input: a script, 1-3
reference images, a voice, and optional visual direction. Output: an MP4 whose
character speaks the audible script, using the same prepared audio for video
generation and the final soundtrack. Do not require a reference video.

## Proposed flow

1. Upload 1-3 JPG/PNG reference images to the app's local-asset endpoint,
   using the same authenticated upload pattern as `video-clone-seedance-v2`.
   Publish stable provider-readable HTTPS URLs (prefer the existing COS
   mirror; provide a clear error if neither COS nor the asset tunnel works).
   Treat image 1 as the main identity anchor; images 2-3 are additional views
   of the same person. Reject mixed identities and invalid files.
2. Require a nonempty script and select a Qwen-Audio-TTS voice. Reuse the
   reference app's Bailian `qwen-audio-3.0-tts-plus` non-streaming synthesis
   and optional voice-enrollment flow, with credentials loaded only in the
   server from this app's `.env`. Save the generated audio persistently and
   let the user preview it before spending video credits. Changing the
   script or voice invalidates that preview.
3. Probe the synthesized audio before any paid video submission. If it is
   shorter than 4 seconds, refuse generation with a friendly warning
   (e.g. `音频不足4秒，请增加口播内容后重试。`). If it is longer than 15
   seconds, crop it to exactly the first 15 seconds with FFmpeg, persist the
   cropped clip and warn clearly (e.g. `音频超过15秒，本次视频仅使用前15秒，
   后续内容不会出现在成片中。`). Let the user preview the *prepared* clip.
   Use this clip, not the uncropped original, everywhere downstream. Tell
   the model to speak what is audible in the provided clip, not to squeeze
   the entire original script into 15 seconds. For eligible clips, set the
   whole-second model duration to the ceiling of the clip length (at most
   15 seconds); do not speed up the prepared audio. Before submitting the
   reference audio, trim any clip that extends beyond that requested duration
   to PCM WAV so MP3 encoder padding cannot extend the reference past the
   video length. Keep the exact submitted clip ID for final muxing, including
   when converting previously prepared MP3 clips. The provider's actual
   returned video length is not available before submission.
4. Reuse the CPRT `master-video-s2-*` contract, initially defaulting to
   `master-video-s2-0-mini` at 480p. Submit the images and the prepared
   (cropped, if necessary) audio to `/master/asset/submit`, wait for `Active`,
   and send their `asset://` references as `reference_image` and
   `reference_audio` content parts, following the reference app's established
   submit process. Do not include a `reference_video`.
   Prompt for one on-camera speaker, identity consistency, the audible script,
   and mouth movements and pauses aligned to the supplied audio. Expose
   resolution/ratio options only after the basic flow is validated.
5. Poll the CPRT job. On completion, download its video and mux in the
   *same persisted reference TTS clip* as the only audio track with FFmpeg.
   Do not synthesize again, add the provider's own speech, or use the
   reference app's camera-shake finalization. Prefer keeping TTS at natural
   speed; check duration mismatch and fail clearly or offer regeneration
   rather than silently changing its timing. Store the finalized MP4 and
   job-to-output mapping so refresh/retry returns the correct audio.

## App and deployment work

- Create a small Chinese-language UI titled `数字人口播`: image upload and
  preview, script entry, voice selection or optional voice-clone sample,
  TTS preview, generation progress, final playback/download, and actionable
  provider-review errors.
- Create a dedicated Node BFF with validation, upload, TTS, quote/start,
  status, and finalize endpoints. Keep CPRT and Bailian keys server-side;
  never copy `.env`, user samples, or generated files into the build.
- Register `speech-video` in the pnpm workspace and standalone build list.
  Give its BFF and asset server independent ports, storage, route, and
  relaunch script; add the app-manager upstream routing/configuration for
  `/standalone/speech-video/`. Reuse existing auth and billing conventions
  for paid video submissions. Keep all application code in this repository.

## Verification and risks

- Unit/contract tests: 1-3 images, bad files/URLs, failed image/audio review,
  missing script/voice, below-4-second refusal before billing, 15-second
  cropping and warning, review of the prepared audio (not the original),
  asset references in CPRT content, and finalized-audio persistence after
  restart.
- Small paid smoke test: one authorized portrait and short Chinese script.
  Verify the provider accepts reviewed images and reviewed audio without a
  reference video.
  Visually inspect lip sync, speaker identity, audio start/end, and final
  output track. A prompt can encourage synchronization but cannot guarantee
  it; if lip sync is poor, evaluate a dedicated audio-driven lip-sync stage.
- Test a >15-second synthesis: the video input and final mux must both use
  the same 15-second crop, and the UI must clearly warn that the remainder
  of the original script will not be spoken.
- Confirm whether a voice-clone sample is mandatory (as in the reference
  app) or whether a supported stock voice should be the default. Do not
  assume a stock voice works with this Bailian model without testing.
- Longer narration is intentionally not included in the initial release:
  the user receives only the first 15 seconds of synthesized speech.

## Source touchpoints

- `video-clone-seedance-v2/server/cprt.ts`: provider image/audio review and
  `reference_image` / `reference_audio` request format.
- `video-clone-seedance-v2/server/bailianSpeech.ts`: voice enrollment and
  non-streaming synthesis.
- `video-clone-seedance-v2/server/server.ts`, `server/media.ts`: orchestration,
  persistent finalized output and FFmpeg audio muxing.
- `video-clone-seedance-v2/services/assetUploadService.ts`: authenticated
  upload pattern; `moduls/app-manager/backend/internal/handler/http_handler.go`:
  standalone BFF routing.
