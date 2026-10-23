# S TTS Standalone

This app is integrated as a local standalone SPA in this repository.

## Route

- `/standalone/s_tts/`

## Local Development

```bash
cd frontend/standalone_apps/s_tts/frontend
npm install
npm run dev
```

## Build And Launch

Use the same deploy pattern as other standalone apps:

```bash
bash deploy/standalone/deploy_standalone_s_tts.sh
```

The app is then served by backend at:

- `http://127.0.0.1:<backend-port>/standalone/s_tts/`

Note: this backend-mounted mode serves static assets only. `PUT /standalone/s_tts/custom_voice_files/...`
returns `404` unless you deploy the app with its own `nginx.conf` (WebDAV enabled).

## Fully Standalone Upload Mode

This app folder already includes upload handling in `nginx.conf`:

- `location /standalone/s_tts/custom_voice_files/`
- `dav_methods PUT DELETE`
- `create_full_put_path on`

To keep upload handling inside this app (without main backend changes), deploy the app container from
this folder and route a dedicated host to it. Then set:

- `VITE_STTS_UPLOAD_BASE_URL=<your-standalone-host-origin>`

Example:

- `VITE_STTS_UPLOAD_BASE_URL=https://s-tts.aiunity.shop`

## Static Assets Used By The App

- Config path: `/standalone/s_tts/config/keys.json`
- Custom voice upload path: `/standalone/s_tts/custom_voice_files/<filename>`

## Bailian V3 (API Manager Integrated)

The 文案转音频 V3 page now uses API Manager public execute routes for Aliyun CosyVoice instead of the app-local `/api/v3` proxy path.

- API Manager endpoints:
	- `POST /api_manager/api/v1/execute/aliyuncs-cosyvoice-clone`
	- `POST /api_manager/api/v1/execute/aliyuncs-cosyvoice-status`
	- `POST /api_manager/api/v1/execute/aliyuncs-cosyvoice-tts`
- Frontend upload path: `/standalone/s_tts/custom_voice_files/<filename>`
- Upload base override: `VITE_STTS_UPLOAD_BASE_URL`

Operational note:

- API Manager must have an enabled key mapped to model `cosyvoice-v3.5-flash`, with the provider `base_url` pointing at the DashScope host (for example `https://dashscope.aliyuncs.com`).
