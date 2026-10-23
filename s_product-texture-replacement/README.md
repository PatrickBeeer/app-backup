# s_product-texture-replacement

Standalone app for product texture/packaging replacement and multi-angle generation.

## Runtime contract

- LLM/image requests are routed through API Manager:
  - `POST /api_manager/api/v1/execute/llm-generate`
- Credits endpoints are routed through user-manager:
  - `GET /user-manager/api/v1/user/credits/balance`
  - `POST /user-manager/api/v1/user/credits/deduct`
- Image model in this app:
  - `gemini-3.1-flash-image-preview`

## Local development

Prerequisite: Node.js

1. Install dependencies:
   - `npm install`
2. Run dev server:
   - `npm run dev`

No browser-side `GEMINI_API_KEY` setup is required for standalone integration.

## Build

- `npm run build`

Expected artifact:

- `dist/index.html`
