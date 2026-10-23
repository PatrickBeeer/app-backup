# 爆款拆解室（rednote-app）

UnityShop 托管型独立应用：粘贴公开小红书笔记链接，AI 拆解爆款原因、用户痛点与评论区需求，并复刻原创标题、正文与封面。

## 架构

本应用是 UnityShop standalone app，由 app-manager 统一托管，不独立部署 Postgres/Redis/MinIO 等重型基础设施。

- **前端** `src/`：React + Vite，构建产物 `dist/` 由 app-manager 在 `/standalone/rednote-app/` 下同源提供。
- **Node BFF** `server/`：无状态 Express 进程（端口 9899，仅监听 127.0.0.1）。持有 TikHub token，负责抓取笔记/评论、下载媒体（封面 + FFmpeg 抽帧）、用 Sharp 合成封面。app-manager 在 `/standalone/rednote-app/api/*` 反代到该 BFF，同源无 CORS。
- **LLM**：走 app-manager 共享的 `geminiProxyService`（`/standalone/rednote-app/api/execute/llm-generate`），浏览器不持有任何 API key。符合仓库约定：standalone apps 必须使用共享 geminiProxyService，不得直连模型 API。

信封格式统一为 `{ success, data, message }`，由 [bffService.ts](src/services/bffService.ts) 消费。

## 本地开发

需要先安装依赖：

```bash
npm install
```

启动 Node BFF（终端 A，读取 `.run/rednote-app.env`）：

```bash
npm run server   # tsx server/server.ts, 监听 127.0.0.1:9899
```

启动前端 dev server（终端 B）：

```bash
npm run dev      # Vite, 端口 5175
```

`vite.config.ts` 已把 `/standalone/rednote-app/api` 反代到 `http://127.0.0.1:9899`，与线上 app-manager 行为一致。浏览器打开 `http://127.0.0.1:5175/standalone/rednote-app/`。

> 注意：dev 模式下 LLM 走 `geminiProxyService` 需要本机能访问 app-manager；若仅调试 BFF/前端交互，可忽略 LLM 相关报错。

## 构建

```bash
npm run build    # vite build → dist/
npm run lint     # tsc --noEmit -p tsconfig.app.json
```

`dist/` 产物由 app-manager 的 `build_standalone_apps.sh` 部署（`rednote-app` 已在 APPS 列表中）。

## 配置

BFF 运行时配置放在 `.run/rednote-app.env`（已 gitignore，本地保存密钥）。模板见 [.env.example](.env.example)：

- `PORT=9899`：BFF 监听端口，app-manager 反代到此。
- `TIKHUB_API_TOKEN`：TikHub Bearer Token，仅服务端使用，绝不下发浏览器。
- `TIKHUB_BASE_URL`、`TIKHUB_*_PATH`：TikHub 小红书详情/评论接口路径。
- `MAX_MEDIA_BYTES`：单个媒体下载上限，默认 20 MB。
- `BANNED_TERMS`：客户端合规检查使用的逗号分隔风险词。

## BFF action

统一入口 `POST /api/run`，body 为 `{ action, ...params }`：

- `health` — 健康检查
- `fetch_note` `{ url }` — 抓取笔记详情
- `fetch_comments` `{ noteId, url }` — 抓取一级评论
- `fetch_media` `{ coverUrl?, videoUrl? }` — 下载封面 / 抽取视频帧，返回 data URL
- `compose_cover` `{ coverType, title, baseImageB64?, typography?, visualReference?, variant? }` — 合成封面

## 目录结构

```
src/           前端（React + Vite）
  services/    bffService、geminiService、orchestration、prompts、schemas 等
  components/  UI 组件
server/        Node BFF（Express，端口 9899）
  server.ts    路由与 action 分发
  tikhub.ts    TikHub 客户端
  media.ts     媒体下载 + FFmpeg 抽帧
  cover.ts     Sharp 封面合成
  config.ts    运行时配置
.run/          本地运行时（env + pid，gitignored）
dist/          构建产物
小红书平台/     参考版本（只读，勿改）
```
