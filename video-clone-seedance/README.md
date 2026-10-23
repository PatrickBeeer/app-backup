<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy standalone app

This app is integrated for Unityshop standalone hosting. Its local BFF owns the CPRT multimodal-video submit and polling flow; the CPRT key never enters the browser bundle.

## Run Locally

**Prerequisites:** Node.js, npm/pnpm, ffprobe, and the running app-manager stack


1. Install dependencies:
   `npm install`
2. Add `CPRT_KEY` to `.env`.
3. Start the BFF:
   `npm run server`
4. Run the app:
   `npm run dev`

## Production Route

- Standalone: `/standalone/video-clone-seedance/`
- Shell launch: `/app/video-clone-seedance`

## Production relaunch

Run `bash relaunch_video_clone_seedance.sh`. The script starts the app-local BFF on `127.0.0.1:9896`, builds this standalone app, and relaunches app-manager with the matching upstream route.
