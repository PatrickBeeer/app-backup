# External Ability System Manual

This manual is for outside callers integrating with the App Chest external ability system.

## Base URL

All external ability requests go through the public Gateway host:

`https://api.doubleespressonosugar.com`

Do not call internal service URLs such as `task-platform`, `api-provider-platform`, or `/api/public/...` paths directly from outside your network. The supported external surface is the capability API under `/v1/capabilities/...`.

## Authentication

Use an Identity user API key in the `Authorization` header:

```http
Authorization: Bearer ack_<8-hex-prefix>_<64-hex-token>
```

Example:

```http
Authorization: Bearer ack_1a2b3c4d_1a2b3c4d........................................................
```

Notes:

- API key format is `ack_<prefix>_<token>`.
- The Gateway validates your API key, then injects a short-lived signed principal internally.
- Outside callers should **not** send `X-Platform-Principal`; the Gateway handles that.
- Application responses are JSON.
- Some Gateway-generated errors, especially certain `401`, `403`, and `405` responses produced by nginx before the request reaches an application handler, may be returned as `text/html`.
- Clients should check both HTTP status and `Content-Type` before assuming the body is JSON.

## Scopes

Your API key must include the scope required by each endpoint.

| Scope | Purpose |
| --- | --- |
| `capability:llm.chat:execute` | Execute chat inference through the provider runtime |
| `capability:task.deployment:list` | List externally available video-generation deployments |
| `capability:task.speech_to_speech:deployment_list` | List externally available speech-to-speech deployments |
| `capability:task.video_generation:create` | Create a video-generation task |
| `capability:task.video_generation:get` | Get one video-generation task |
| `capability:task.video_generation:list` | List your video-generation tasks |
| `capability:task.video_generation:cancel` | Cancel a video-generation task |
| `capability:task.speech_to_speech:create` | Create a speech-to-speech task |
| `capability:task.speech_to_speech:get` | Get one speech-to-speech task |
| `capability:task.speech_to_speech:list` | List your speech-to-speech tasks |
| `capability:task.speech_to_speech:cancel` | Cancel a speech-to-speech task |

## Available Endpoints

### 1. Execute Chat

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/llm.chat/execute`
- Required scope: `capability:llm.chat:execute`

What it does:

- Runs a chat request against the provider runtime.
- Returns an execution record including status, selected deployment, request/response data, and usage metadata.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/llm.chat/execute" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "chat",
    "model_id": "YOUR_MODEL_ID",
    "payload": {
      "messages": [
        {"role": "user", "content": "Write a short hello world in Go."}
      ]
    },
    "preferences": {},
    "metadata": {
      "client_request_id": "chat-demo-001"
    }
  }'
```

Common request fields:

- `capability`: use `chat`
- `model_id`: required unless your runtime contract is extended elsewhere
- `payload.messages`: recommended chat input shape
- `payload.prompt` or `payload.input`: also accepted by current adapters

### 2. List Video Generation Deployments

- Method: `GET`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/deployments`
- Required scope: `capability:task.deployment:list`

What it does:

- Returns the externally available video-generation deployments mirrored from the provider platform.
- Use this endpoint first to discover valid `deployment_id`, `model_id`, `provider`, and model-family values.
- It is valid for this endpoint to return an empty `items` array if no deployments are currently mirrored and enabled for the environment.

Supported query parameters:

- `provider`
- `model_family`
- `region`
- `enabled` default: `true`
- `limit` default: `50`

Example:

```bash
curl "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/deployments?provider=klingai&enabled=true&limit=20" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY"
```

Response shape:

```json
{
  "items": [
    {
      "deployment_id": "uuid",
      "deployment_name": "Kling 3.0 Turbo",
      "tenant_id": "uuid-or-tenant",
      "capability": "vid_gen",
      "provider_slug": "klingai",
      "provider_name": "KlingAI",
      "model_id": "uuid",
      "model_slug": "kling-3-0-turbo",
      "model_name": "Kling 3.0 Turbo",
      "model_family": "kling-3",
      "region": "global",
      "enabled": true,
      "status": "active",
      "metadata": {},
      "source_updated_at": "2026-08-26T00:00:00Z",
      "synced_at": "2026-08-26T00:00:00Z"
    }
  ]
}
```

Deployment selection guidance:

- Use `enabled=true` as the primary signal that a deployment is selectable.
- Treat `status` as informational metadata unless stricter selection rules are documented for your environment.
- Current live results include `status: active`.

### 3. Create Video Generation Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/create`
- Required scope: `capability:task.video_generation:create`

What it does:

- Creates a task owned by the authenticated identity/API key.
- The task platform estimates routing/cost first, then enqueues execution.

Important request rules:

- `model_id` is required.
- `capability` may be omitted; it defaults to `vid_gen`.
- `capability`, if provided, must be `vid_gen` or `video_generation`.
- `deployment_id` is optional and can be used to pin a specific deployment.
- The exact `payload` structure depends on the selected provider/model.
- For Kling-style video tasks, put the provider/model-specific request body inside `payload`.
- For Kling Omni specifically, use the provider-style `contents`, optional `settings`, and optional `options` fields inside `payload`.
- Do not assume a single field such as `image_url` works for every video model family.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/create" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "vid_gen",
    "model_id": "YOUR_MODEL_ID",
    "deployment_id": "OPTIONAL_DEPLOYMENT_ID",
    "payload": {
      "prompt": "A cinematic drone shot over a neon-lit city at night",
      "image_url": "https://example.com/reference-image.jpg"
    },
    "preferences": {},
    "metadata": {
      "client_request_id": "vidgen-demo-001"
    }
  }'
```

Kling Omni example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/create" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "vid_gen",
    "model_id": "YOUR_KLING_OMNI_MODEL_ID",
    "deployment_id": "OPTIONAL_KLING_OMNI_DEPLOYMENT_ID",
    "payload": {
      "contents": [
        {
          "type": "prompt",
          "text": "A woman walks through a sunlit cafe"
        },
        {
          "type": "refer_image",
          "url": "https://example.com/reference-image.jpg",
          "id": "image_1"
        },
        {
          "type": "feature_video",
          "url": "https://example.com/feature-video.mp4",
          "id": "video_1"
        }
      ],
      "settings": {
        "resolution": "1080p",
        "duration": 5,
        "audio": "off",
        "multi_shot": false,
        "aspect_ratio": "9:16"
      },
      "options": {
        "external_task_id": "kling-omni-demo-001"
      }
    },
    "metadata": {
      "client_request_id": "kling-omni-demo-001"
    }
  }'
```

Notes for Kling Omni callers:

- `contents` is the canonical Omni input field.
- Use `type: "refer_image"` for reference images and `type: "feature_video"` for feature/reference video input.
- `settings` carries output controls such as `resolution`, `duration`, `audio`, `multi_shot`, and `aspect_ratio`.
- `options` carries common provider options such as `callback_url`, `external_task_id`, and watermark configuration when supported.
- Choose the payload shape based on the selected deployment/model rather than assuming one universal video-generation schema.

Typical response:

```json
{
  "id": "task_uuid",
  "status": "queued",
  "capability": "vid_gen",
  "model_id": "uuid",
  "deployment_id": "uuid",
  "estimated_total_cost": 0.12,
  "estimated_currency": "USD",
  "payload": {},
  "preferences": {},
  "metadata": {},
  "created_at": "2026-08-26T00:00:00Z",
  "updated_at": "2026-08-26T00:00:00Z"
}
```

### 4. Get One Video Generation Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/get`
- Required scope: `capability:task.video_generation:get`

What it does:

- Fetches one task by `task_id`.
- Only tasks owned by the authenticated principal are visible.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/get" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "YOUR_TASK_ID"
  }'
```

### 5. List Your Video Generation Tasks

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/list`
- Required scope: `capability:task.video_generation:list`

What it does:

- Lists video-generation tasks belonging to the authenticated identity.
- Default limit is `20`.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/list" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20
  }'
```

Response shape:

```json
{
  "items": []
}
```

### 6. Cancel Video Generation Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/cancel`
- Required scope: `capability:task.video_generation:cancel`

What it does:

- Cancels a task you own.
- If the provider execution is already running, the task platform also forwards a cancellation request downstream.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.video_generation/cancel" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "YOUR_TASK_ID",
    "reason": "No longer needed"
  }'
```

Typical response:

```json
{
  "id": "task_uuid",
  "status": "cancelled",
  "error_message": "No longer needed",
  "updated_at": "2026-08-26T00:00:00Z"
}
```

### 7. List Speech-To-Speech Deployments

- Method: `GET`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/deployments`
- Required scope: `capability:task.speech_to_speech:deployment_list`

What it does:

- Returns the externally available STS deployments mirrored from the provider platform.
- Use this endpoint first to discover valid `deployment_id`, `model_id`, `provider`, and model-family values for audio transformation.
- It is valid for this endpoint to return an empty `items` array if no STS deployments are currently mirrored and enabled for the environment.

Supported query parameters:

- `provider`
- `model_family`
- `region`
- `enabled` default: `true`
- `limit` default: `50`

Example:

```bash
curl "https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/deployments?provider=elevenlabs&enabled=true&limit=20" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY"
```

Response shape:

```json
{
  "items": [
    {
      "deployment_id": "uuid",
      "deployment_name": "ElevenLabs Voice Changer",
      "tenant_id": "uuid-or-tenant",
      "capability": "speech_to_speech",
      "provider_slug": "elevenlabs",
      "provider_name": "ElevenLabs",
      "model_id": "uuid",
      "model_slug": "eleven-multilingual-sts-v2",
      "model_name": "Eleven Multilingual STS v2",
      "model_family": "elevenlabs-sts",
      "region": "global",
      "enabled": true,
      "status": "active",
      "metadata": {},
      "source_updated_at": "2026-08-26T00:00:00Z",
      "synced_at": "2026-08-26T00:00:00Z"
    }
  ]
}
```

### 8. Create Speech-To-Speech Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/create`
- Required scope: `capability:task.speech_to_speech:create`

What it does:

- Creates a task owned by the authenticated identity/API key.
- The task platform estimates routing/cost first, then enqueues execution against an eligible STS deployment.

Important request rules:

- `model_id` is required.
- `capability` may be omitted; it defaults to `speech_to_speech`.
- `capability`, if provided, must be `speech_to_speech`.
- `deployment_id` is optional and can be used to pin a specific STS deployment.
- `payload.voice_id` is required.
- `payload.source_asset` is required and must describe an audio input.
- `payload.source_asset.fetch_url` must be a provider-fetchable `https` URL.
- `payload.result_target` is required.
- `payload.result_target.kind` must be `upload_target`.
- `payload.result_target.method` must be `PUT`.
- Outside callers should provide only public capability URLs; do not use internal service URLs in `fetch_url` or `upload_url`.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/create" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "speech_to_speech",
    "model_id": "YOUR_MODEL_ID",
    "deployment_id": "OPTIONAL_DEPLOYMENT_ID",
    "payload": {
      "voice_id": "VOICE_ID",
      "source_asset": {
        "kind": "audio",
        "role": "source_audio",
        "fetch_url": "https://example.com/source-audio.mp3",
        "mime_type": "audio/mpeg",
        "duration_seconds": 14.89
      },
      "result_target": {
        "kind": "upload_target",
        "method": "PUT",
        "upload_url": "https://example.com/result-upload.mp3",
        "headers": {
          "Content-Type": "audio/mpeg"
        }
      },
      "output_format": "mp3_44100_128",
      "enable_logging": false,
      "remove_background_noise": true,
      "voice_settings": {
        "stability": 0.4
      }
    },
    "preferences": {},
    "metadata": {
      "client_request_id": "sts-demo-001"
    }
  }'
```

Typical response:

```json
{
  "id": "task_uuid",
  "status": "queued",
  "capability": "speech_to_speech",
  "model_id": "uuid",
  "deployment_id": "uuid",
  "estimated_total_cost": 0.03,
  "estimated_currency": "USD",
  "payload": {},
  "preferences": {},
  "metadata": {},
  "created_at": "2026-08-26T00:00:00Z",
  "updated_at": "2026-08-26T00:00:00Z"
}
```

### 9. Get One Speech-To-Speech Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/get`
- Required scope: `capability:task.speech_to_speech:get`

What it does:

- Fetches one STS task by `task_id`.
- Only tasks owned by the authenticated principal are visible.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/get" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "YOUR_TASK_ID"
  }'
```

When an STS task completes successfully, the `result` object typically includes normalized provider output metadata such as:

- `execution_id`
- `selected_deployment_id`
- `usage`
- `output_asset`

Representative completed result fragment:

```json
{
  "id": "task_uuid",
  "status": "completed",
  "result": {
    "execution_id": "provider_execution_uuid",
    "selected_deployment_id": "deployment_uuid",
    "usage": {
      "duration_seconds": 14.89,
      "input_duration_seconds": 14.89,
      "output_duration_seconds": 14.89
    },
    "output_asset": {
      "kind": "audio",
      "mime_type": "audio/mpeg",
      "duration_seconds": 14.89
    }
  }
}
```

### 10. List Your Speech-To-Speech Tasks

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/list`
- Required scope: `capability:task.speech_to_speech:list`

What it does:

- Lists STS tasks belonging to the authenticated identity.
- Default limit is `20`.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/list" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20
  }'
```

Response shape:

```json
{
  "items": []
}
```

### 11. Cancel Speech-To-Speech Task

- Method: `POST`
- URL: `https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/cancel`
- Required scope: `capability:task.speech_to_speech:cancel`

What it does:

- Cancels an STS task you own.
- If the provider execution is already running, the task platform also forwards a cancellation request downstream.

Example:

```bash
curl -X POST "https://api.doubleespressonosugar.com/v1/capabilities/task.speech_to_speech/cancel" \
  -H "Authorization: Bearer $APP_CHEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "YOUR_TASK_ID",
    "reason": "No longer needed"
  }'
```

Typical response:

```json
{
  "id": "task_uuid",
  "status": "cancelled",
  "error_message": "No longer needed",
  "updated_at": "2026-08-26T00:00:00Z"
}
```

## Task Statuses

The task platform currently uses these statuses:

| Status | Meaning | Terminal |
| --- | --- | --- |
| `queued` | Task has been accepted and is waiting for a worker | No |
| `running` | A worker has claimed the task and provider execution is in progress | No |
| `retry_wait` | A prior attempt failed and the task is waiting to be re-queued | No |
| `cancelling` | Cancellation was requested while the task was running | No |
| `completed` | Task finished successfully | Yes |
| `failed` | Task finished unsuccessfully and no more retries remain | Yes |
| `cancelled` | Task was cancelled | Yes |

## Recommended Calling Flow

For video generation, the recommended external flow is:

1. Create or obtain an API key with the task scopes you need.
2. Call `GET /v1/capabilities/task.video_generation/deployments`.
3. Choose a suitable `model_id` and optionally a `deployment_id`.
4. Call `POST /v1/capabilities/task.video_generation/create`.
5. Poll `POST /v1/capabilities/task.video_generation/get` until the task reaches a terminal status.
6. Optionally call `POST /v1/capabilities/task.video_generation/cancel` if you need to stop it.

For speech-to-speech, the recommended external flow is:

1. Create or obtain an API key with the STS task scopes you need.
2. Call `GET /v1/capabilities/task.speech_to_speech/deployments`.
3. Choose a suitable `model_id` and optionally a `deployment_id`.
4. Prepare a provider-fetchable `https` `source_asset.fetch_url`.
5. Prepare a writable `result_target` upload URL.
6. Call `POST /v1/capabilities/task.speech_to_speech/create`.
7. Poll `POST /v1/capabilities/task.speech_to_speech/get` until the task reaches a terminal status.
8. Optionally call `POST /v1/capabilities/task.speech_to_speech/cancel` if you need to stop it.

Recommended polling guidance:

- Start with a `2-5` second interval.
- If the task remains in `queued`, `running`, `retry_wait`, or `cancelling`, continue polling.
- Use simple exponential backoff for longer-running tasks, for example `2s`, `4s`, `8s`, then cap at `15-30s`.
- Treat `completed`, `failed`, and `cancelled` as terminal states.
- No `Retry-After` header is currently documented for task polling responses.

## Error Behavior

Common external responses:

- `401 Unauthorized`: missing, malformed, expired, revoked, or otherwise invalid API key
- `403 Forbidden`: API key does not include the required scope
- `405 Method Not Allowed`: wrong HTTP method for the endpoint
- `400 Bad Request`: request body failed validation, for example missing `model_id`, `task_id`, `voice_id`, `source_asset`, or `result_target`

Error body guidance:

- When the request reaches a platform application handler, errors are typically JSON in the form:

```json
{"error":"message"}
```

- Gateway-generated errors may instead be HTML error pages.
- Task-creation estimation failures are returned as stable external messages such as `model_id is unavailable` or `no eligible deployment found` rather than exposing internal service paths.

## Response Notes

Representative response envelopes:

- `POST /v1/capabilities/llm.chat/execute`: returns an execution record containing fields such as `execution_id`, `status`, `selected_deployment_id`, `request`, `response`, `usage`, `created_at`, and `updated_at`.
- `POST /v1/capabilities/task.video_generation/get`: returns a single task object with fields such as `id`, `status`, `capability`, `model_id`, `deployment_id`, `payload`, `preferences`, `metadata`, `result`, `error_message`, `created_at`, and `updated_at`.
- `POST /v1/capabilities/task.video_generation/cancel`: returns the updated task object after the cancellation request is accepted.
- `POST /v1/capabilities/task.speech_to_speech/get`: returns a single task object with fields such as `id`, `status`, `capability`, `model_id`, `deployment_id`, `payload`, `preferences`, `metadata`, `result`, `error_message`, `created_at`, and `updated_at`.
- `POST /v1/capabilities/task.speech_to_speech/cancel`: returns the updated task object after the cancellation request is accepted.

## Ownership and Visibility

- Task records are filtered by the authenticated identity principal.
- You can only get, list, or cancel tasks created under your own user/API-key context.
- The platform propagates identity attribution internally for auditing and usage tracking.

## Boundary Notes

- Direct COS/storage actions are **not** exposed as public external endpoints in this ability surface.
- Storage orchestration for provider tasks remains inside platform-owned services.
- For STS specifically, the task platform owns task-scoped audio lifecycle, while `api-provider-platform` only performs transient fetch/execute/upload work behind the scenes.
- Outside callers should integrate through the task capability endpoints above rather than building directly against internal provider or storage modules.
