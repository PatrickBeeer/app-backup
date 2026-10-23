<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Product Video

这是一个集成到 UnityShop standalone host 的产品视频工作台。前端通过 `app-manager -> api-manager` 走通用 AI 执行链路，Kling 媒体转发、音轨合并和 ElevenLabs 配音走本地 Node 后端。

## Run Locally

**Prerequisites:** Node.js 20+


1. Install dependencies: `npm install`
2. Start the local backend: `npm run server`
3. Start the frontend: `npm run dev`

推荐通过 UnityShop 的 standalone host 打开：`/standalone/product-video/`。

本地后端常用环境变量：

- `PRODUCT_VIDEO_BACKEND_PORT`，默认 `9897`
- `KLING_API_KEY`
- `ELEVENLABS_API_KEY`
- `KLING_NETWORK_BRIDGE_URL`

完成代码集成后，还需要重新构建 standalone app，并执行 app-manager 的 catalog 同步或注册流程，让 `/standalone/product-video/` 被主站识别。
