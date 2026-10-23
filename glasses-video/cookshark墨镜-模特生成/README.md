# COOKSHARK AI Eyewear Studio

本项目是可在本机运行的 Vite 应用。依赖、React、图标、Tailwind CSS 和 Gemini SDK 均从本地 `node_modules` 加载，运行时不依赖 AI Studio CDN 或浏览器 importmap。

## 本地运行

前置条件：Node.js 18+。

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env.local`，填写图片生成 API 配置（`GEMINI_IMAGE_API_KEY`、`GEMINI_API_BASE_URL`、`GEMINI_IMAGE_MODEL`）
3. 启动：`npm run dev`
4. 打开默认地址：`http://localhost:3000`

生产构建：`npm run build`；本地预览：`npm run preview`。

当前图片生成使用配置的 `v1beta` Gemini 兼容端点；文字生成配置暂未接入，因为当前应用没有文字生成链路。受保护的 Prompt、System Instruction、图片输入顺序、请求体结构和 seed 逻辑保留原样。
