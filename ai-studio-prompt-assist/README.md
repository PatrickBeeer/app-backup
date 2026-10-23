# AI Studio Prompt Assist (Standalone)

This app is integrated as a UnityShop standalone app.

## Development

1. Install shared workspace dependencies from `apps/shared_dependencies`:
   - `pnpm install -r`
2. Run this app:
   - `pnpm --filter ai-studio-prompt-assist-standalone dev`

## Build

- `pnpm --filter ai-studio-prompt-assist-standalone build`

## API Notes

- External AI calls must go through API Manager endpoint:
  - `/api_manager/api/v1/execute/llm-generate`
- Text generation uses model `gemini-3-flash-preview` with `task: text_gen`.
