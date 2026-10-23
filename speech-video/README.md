# 数字人口播

Standalone app at `/standalone/speech-video/`. All source and runtime services
live in this repository; OmniHuman 1.5 and Bailian are external inference providers.

## Run locally

1. Run `npm install` in this directory (or install from `apps/shared_dependencies`).
2. Keep `VOLCENGINE_API_KEY_SECRET`, `BAILIAN_KEY`,
   `BAILIAN_WORKSPACE_ID`, and `BAILIAN_REGION` in this app's private `.env`.
   Set `OMNIHUMAN_VIDEO_POINTS_PER_SECOND` to an agreed positive whole-number
   video price (points per requested second). Video submissions are blocked
   until it is set. Never put credentials in Vite env.
3. Run `npm run server` for the BFF (127.0.0.1:9905) and asset service
   (127.0.0.1:9904), then `npm run dev` for the frontend.
4. Provider-accessible assets need the existing COS presign service on
   port 3051, or `npm run tunnel` with `cloudflared`. Browsing and audio
   preview use the app-manager output route and work without the tunnel.

`bash relaunch_speech_video.sh` starts the BFF, optional tunnel, builds the
frontend and app-manager, and configures its upstream. For an existing
app-manager deployment, retain the other apps' upstream variables in
`moduls/app-manager/.run/app-manager.env` before relaunching.

Use one clear portrait (under 5MB, width and height under 4096px) and an
uploaded, authorized voice sample for Bailian voice enrollment. Generate
audio before video; under 4 seconds is rejected, over 15 seconds is cropped
with a visible warning. The 1080p quality-mode OmniHuman request uses the
same prepared audio as the final MP4. Results are downloaded and persisted
because provider video URLs expire after one hour. Existing CPRT jobs remain
readable through the legacy polling path. The audio button bills 2 points via
app-manager's `audio_gen` rule and refunds on a failed request. Video jobs
use the billed `/api/execute/run` route and the `video_gen` pricing rule;
the quote charges `OMNIHUMAN_VIDEO_POINTS_PER_SECOND` times the requested
duration. Apply `moduls/app-manager/backend/database/migrations/0014_speech_video_audio_pricing.sql`
to configure audio billing on an existing deployment. The finished player
includes playback, seeking, mute, and fullscreen controls.

Run `npm test`, `npm run lint`, and `npm run build` to verify the app.
