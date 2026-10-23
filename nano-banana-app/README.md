# Nano Banana Standalone App

This app is integrated as a UnityShop standalone application at:

- `/standalone/nano-banana-app/`
- `/app/nano-banana-app` (via app shell)

## Local development

1. Install dependencies in shared workspace:
   - `cd /root/projects/unityshop/apps/shared_dependencies`
   - `pnpm install -r`
2. Run this app:
   - `cd /root/projects/unityshop/apps/standalone_apps/nano-banana-app`
   - `npm run dev`

## Notes

- Frontend model calls go through API Manager execute routes (no direct provider API key usage in browser).
- Text generation model: `gemini-3-flash-preview`
- Image generation model: `gemini-3.1-flash-image-preview`
- Video generation model: `grok-video-3-pro` (not used in current app flow, no video task in this UI)
- Image cost is configured as 10 points per image in the app UI flow.
- Image generation uses staggered batch dispatch (small sequential delay) and shows the first returned image immediately.
