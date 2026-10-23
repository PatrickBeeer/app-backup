# financial-dashboard backend (Go)

A Go reimplementation of the legacy `legacy/server.py.bak` that powers the
财务驾驶舱 standalone app. It serves the static frontend out of `../dist`,
reads/writes month JSON files under `../dist/data/months/`, and exposes the
JSON APIs the frontend calls (including `/api/smart-entry`, the 智能录入
endpoint that previously returned 404 because no backend was running).

## Build

```bash
cd apps/standalone_apps/financial-dashboard/backend
go build -o ../.run/bin/finance-dashboard ./cmd/finance-dashboard
```

## Run

```bash
cd apps/standalone_apps/financial-dashboard
./.run/bin/finance-dashboard --addr 127.0.0.1:5173 --root .
```

The relaunch script `moduls/dev-console/scripts/standalone_apps/relaunch_financial_dashboard.sh`
performs the build + start automatically.

## AI keys

`/api/smart-entry`, `/api/chat-edit` and the AI fallback path of `/api/import`
need at least one of these in `<root>/.env` (or in the process env):

- `OPENAI_API_KEY` (optional `OPENAI_MODEL`, default `gpt-4.1-mini`)
- `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default `gemini-2.5-flash`)

Without keys configured, the smart-entry endpoint returns a friendly JSON
error rather than a 404, matching the legacy Python behavior.

## Excel import (LLM parser)

`/api/import` for Excel files now calls the excel-parser service and then
routes CSV + screenshot content through api-manager (model
`gemini-3-flash-preview`). Configure these environment variables in `.env`
or the process env:

- `EXCEL_PARSER_URL` (default `http://apps-excel-parser:4001`)
- `API_MANAGER_URL` (default `http://api-manager:3051`)
- `MAX_SHEET_ROWS` (default `200`)
- `IMAGE_BATCH_LIMIT` (default `6`)
- `IMAGE_TOTAL_LIMIT` (default `24`)

For the current host-run development flow (backend started directly on the
host, while `apps-excel-parser` remains in Docker), set these in
`apps/standalone_apps/financial-dashboard/.env`:

```env
EXCEL_PARSER_URL=http://127.0.0.1:4001
API_MANAGER_URL=http://127.0.0.1:3051
```

Keep the container-oriented defaults above unchanged so the app can move to
container-to-container calls later without a code change.

## Endpoints

| Method | Path                   | Notes                                          |
|--------|------------------------|------------------------------------------------|
| POST   | `/api/import`          | multipart upload, .xlsx / .xlsm / image        |
| POST   | `/api/smart-entry`     | JSON `{month, text, hint?}` 智能录入           |
| POST   | `/api/manual-entry`    | JSON manual ledger entry                       |
| POST   | `/api/update-entry`    | JSON edit by index                             |
| POST   | `/api/delete-entry`    | JSON delete by index                           |
| POST   | `/api/rename-category` | JSON rename a cost category                    |
| POST   | `/api/chat-edit`       | JSON or multipart for chat-style corrections   |
| GET    | `/`, `/data/...`, etc. | Static files from `../dist`                    |

## Layout on disk

- `backend/` — Go source
- `dist/` — built frontend (index.html, app.js, styles.css)
- `dist/data/manifest.json` + `dist/data/months/<id>.json` — month files
  (frontend reads them via relative URLs)
- `uploads/` — raw uploaded files referenced by attachments
- `.run/bin/finance-dashboard` — built binary
- `logs/finance-dashboard.log` — runtime log
