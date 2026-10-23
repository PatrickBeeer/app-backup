# AI短剧导演

一个中文 Web 应用，用于把故事内容拆解为分镜脚本，并生成中文文生图提示词与图生视频提示词。

在 unity_shop 集成中，该应用按 standalone SPA 挂载到 `/standalone/s_short-drama-director/`，并通过主站后端的 API Manager 代理接口完成模型调用。

## 技术栈

- 前端：React + Vite + TypeScript
- 模型接入：通过主站 API Manager 执行代理（`/api_manager/api/v1/execute/llm-generate`）

## 目录结构

- `frontend`
  中文 UI、故事输入、参数配置、结果展示、导出功能
- `backend`
  分镜生成 API、LLM 兼容层、演示模式
- `docs/plans`
  本次项目设计文档

## 启动方式

先安装依赖：

```bash
cd frontend
npm install
```

开发模式：

```bash
npm run dev
```

构建：

```bash
cd frontend
npm run build
```

本仓库集成后，推荐使用部署脚本：

```bash
bash deploy/standalone/deploy_standalone_s_short_drama_director.sh
```

## API 配置

说明：

- 生产部署时由主站后端提供 `/api_manager/api/v1/execute/llm-generate` 接口。
- 页面生成能力依赖登录态，并使用 standalone token fallback：
  - `unityshop-main-frontend-token`
  - `user_manager_token`
  - `auth_token`
  - `admin_token`
- 本应用扣费接口走 user-manager：
  - `GET /user-manager/api/v1/user/credits/balance`
  - `POST /user-manager/api/v1/user/credits/deduct`

## 主要能力

- 输入故事梗概，或上传 `.txt` / `.md` 文件
- 配置总时长、风格、视角、角色外观和额外要求
- 自动生成分镜表格、中文文生图提示词、中文图生视频提示词
- 明确显示单镜头时长校验结果
- 导出 Markdown / JSON
