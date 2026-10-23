# 器物光场 · 餐饮具 AI 主图工作台 (tea-and-repast)

独立应用（standalone app），由 app-manager 托管。前端为纯 JS（Vite 打包），
所有外部 AI 调用经由平台 API Manager（`/standalone/tea-and-repast/api/execute/llm-generate`），
使用浏览器的会话 Bearer Token，不在前端持有任何上游 API Key。

- 线上入口：`https://www.aiunity.shop/app/tea-and-repast`（主前端外壳 + 站点顶栏，iframe 加载 `/standalone/tea-and-repast/`）
- 直连入口：`https://www.aiunity.shop/standalone/tea-and-repast/`
- 计费：分析请求 `text_gen`，图片生成/重做 `image_gen`（见 `app_manager.app_pricing`）

详见 `apps/docs/standalone_app_host_handbook.md`。

## 本地开发

```bash
pnpm install
pnpm dev      # http://localhost:3000 （dev 模式下回退到 /api_manager/... 代理）
```

dev 模式下浏览器 location 不在 `/standalone/...` 下，内置客户端会回退到
`/api_manager/api/v1/execute/llm-generate`，并由 `vite.config.ts` 的 proxy 转发到
本机 app-manager（127.0.0.1:3002）。

## 构建

```bash
pnpm build    # 产出 dist/index.html，由 app-manager serveStandalone 提供
```
