<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Product Detail Page (Standalone)

This app is integrated as a standalone module hosted under:

- `/standalone/product-detail-page/`

## Local Development

Prerequisites: Node.js

1. Install dependencies:
   `npm install`
2. Start development server:
   `npm run dev`
3. Build for production:
   `npm run build`

## Integration Notes

- Frontend AI generation requests go through API Manager proxy (`/api_manager/api/v1/execute/llm-generate`).
- No Gemini API key should be exposed in frontend environment variables.
- Model routing policy:
  - Text tasks: `gemini-3-flash-preview`
  - Image tasks: `gemini-3.1-flash-image-preview`
  - Video tasks: `veo_3_1`
