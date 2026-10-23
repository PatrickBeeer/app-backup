# 商品裂变实验室

UnityShop standalone app:

- app id: `product-fission`
- route: `/standalone/product-fission/`
- shell entry: `/app/product-fission`
- text model: `gemini-3-flash-preview`
- analysis billing task: `product_analysis` (10 points)
- execution-plan and JSON repair billing task: `text_gen` (currently 2 points per call, unchanged)

## Development

Run commands from `apps/shared_dependencies`:

```bash
pnpm --filter product-fission-standalone lint
pnpm --filter product-fission-standalone build
pnpm --filter product-fission-standalone dev
```

The Vite development server listens on port `5055`.

## Runtime

The production app is static and is served by app-manager from `dist/`.
There is no Python process or app-specific Node.js server.

All model requests go through:

```text
/standalone/product-fission/api/execute/llm-generate
```

Provider URLs and API keys must not be added to this browser-facing package.

For local demo fixtures without model calls, create `.env.local` containing:

```text
VITE_DEMO_MODE=true
```
