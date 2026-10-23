## LLM-First Excel Import Plan

Replace the rigid Excel parsing in financial-dashboard with a thin excel-parser client and an LLM-driven extraction via API Manager (gemini-3-flash-preview). excel-parser focuses on CSV + image extraction; financial-dashboard builds prompts, batches images, and normalizes the LLM output into the existing entries schema.

### Steps

1. Expand excel-parser /parse output to include per-sheet CSV text, row/column counts, and image metadata with base64 payloads. Implement naming as sheet<sanitized>_column<letter>_row<row>, sanitize sheet names (spaces -> underscore, strip path separators), and add optional request params like max_rows and max_images for payload control.
2. Implement CSV generation (encoding/csv) and Excel image extraction (excelize) in apps/tooling/excel-parser/main.go, capturing sheet name, row/column anchor, mime type, and bytes for each image.
3. Add an internal excel-parser client in financial-dashboard that uploads the saved Excel file to http://apps-excel-parser:4001/parse, parses the JSON response, and enforces image limits (max 6 per LLM call, max 24 total, error if exceeded).
4. Add an API Manager LLM client in financial-dashboard that sends LLMGenerateRequest to http://api-manager:3051/api/v1/execute/llm-generate with Model = gemini-3-flash-preview, SystemInstruction for role/output rules, and Contents.parts containing: (a) context + CSV text and (b) inline image parts. Set config to JSON output and temperature 0.
5. Implement batching: split images into chunks of 6; for each chunk, call the LLM with the same CSV context plus that image batch, parse the response (API Manager envelope -> Gemini candidates -> text), and normalize via existing AIEntries. Merge results across batches and then into the month data.
6. Replace the current importExcel flow to use only excel-parser + LLM (remove ParseDetail/ParseSalary/ParseEnrollment/ParseHint heuristics). Keep attachment handling, but update errors for LLM/parse failures and "no entries found".
7. Document new requirements/env vars (EXCEL_PARSER_URL, API_MANAGER_URL, IMAGE_BATCH_LIMIT, IMAGE_TOTAL_LIMIT, MAX_SHEET_ROWS).

### Relevant files

- apps/tooling/excel-parser/main.go - extend /parse output with CSV + images
- apps/standalone_apps/financial-dashboard/backend/internal/server/server.go - replace importExcel flow
- apps/standalone_apps/financial-dashboard/backend/internal/parser/ai.go - new prompt builder for CSV + images; reuse AIEntries
- apps/standalone_apps/financial-dashboard/backend/internal/aiclient/aiclient.go - API Manager call + response parsing
- apps/standalone_apps/financial-dashboard/backend/README.md - update docs/envs

### Verification

1. Upload a multi-sheet Excel with embedded screenshots and confirm /api/import returns entries and attaches the source file.
2. Validate image naming matches sheet<name>_column<letter>_row<row> and that >24 images returns a clear error.
3. Test a no-image Excel file to ensure a single LLM call returns valid entries JSON.
4. Confirm API Manager responses parse correctly and LLM errors surface with actionable messages.

### Decisions

- LLM calls happen in financial-dashboard; excel-parser only extracts CSV + images.
- excel-parser returns JSON with CSV text and image base64 for easiest prompt assembly.
- LLM output stays in the existing {entries:[{name,amount,type,category,note}]} schema.
