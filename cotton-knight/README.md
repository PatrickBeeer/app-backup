# Cotton Knight Standalone

This standalone app is hosted by UnityShop under `/standalone/cotton-knight/`
and launched through `/app/cotton-knight`.

## Local workflow

Use the shared workspace so dependencies stay aligned with other standalone apps:

1. `cd /root/projects/unityshop/apps/shared_dependencies`
2. `pnpm install -r`
3. `pnpm --filter cotton-knight-standalone dev`

## AI routing

- Text generation uses `gemini-3-flash-preview`
- Image generation uses `gemini-3.1-flash-image-preview` (default) or `gpt-image-2` (when selected in the model picker)
- Browser-facing AI calls go through UnityShop API Manager via `shared_services/geminiProxyService.ts`
- No provider API keys should be exposed in frontend code
