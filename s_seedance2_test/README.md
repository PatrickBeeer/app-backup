# Seedance 2.0 体验版

Standalone app for Seedance 2.0 capability testing.

## Features

- Text-to-video
- Image-to-video (first frame)
- Image-to-video (first + last frame)
- Multimodal reference (image/video/audio)
- Video editing
- Video extension
- Web search tool mode (`tools: [{ type: "web_search" }]`)
- Draft mode (`draft`)
- Asset-based references via `asset://<asset-id>` for virtual persona and authorized real materials

## API Endpoints

- Create task: `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- Query task: `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`

## Local Run

```bash
cd /root/projects/unityshop/apps/shared_dependencies
pnpm install -r
pnpm --filter s-seedance2-test dev
```

## Build

```bash
cd /root/projects/unityshop/apps/shared_dependencies
pnpm --filter s-seedance2-test build
```
