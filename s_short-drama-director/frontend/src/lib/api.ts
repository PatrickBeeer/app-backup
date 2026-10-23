import type {
  StoryboardRequestPayload,
  StoryboardShot,
  StoryboardResponse,
} from '../types'

const GEMINI_EXECUTE_ENDPOINT = '/api_manager/api/v1/execute/llm-generate'
const CREDIT_BALANCE_ENDPOINT = '/user-manager/api/v1/user/credits/balance'
const APP_ID = 's_short-drama-director'
const STORYBOARD_COST = 20

const AUTH_TOKEN_KEYS = [
  'unityshop-main-frontend-token',
  'user_manager_token',
  'auth_token',
  'admin_token',
] as const

type AuthTokenKey = (typeof AUTH_TOKEN_KEYS)[number]

const blockedTokenKeys = new Set<AuthTokenKey>()
const CREDITS_CACHE_KEY = 'user_credits'
let cachedCredits = Number(window.localStorage.getItem(CREDITS_CACHE_KEY) || '0') || 0

type ExecuteEnvelope<T> = {
  success?: boolean
  data?: T
  message?: string
  error?: { message?: string }
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

function shouldRemoveTokenKeyOnUnauthorized(key: AuthTokenKey) {
  return key === 'auth_token' || key === 'admin_token'
}

function listAuthTokens(): Array<{ key: AuthTokenKey; token: string }> {
  const result: Array<{ key: AuthTokenKey; token: string }> = []
  const seen = new Set<string>()

  for (const key of AUTH_TOKEN_KEYS) {
    if (blockedTokenKeys.has(key)) {
      continue
    }

    const value = window.localStorage.getItem(key)
    const token = value?.trim()
    if (!token || seen.has(token)) {
      continue
    }

    seen.add(token)
    result.push({ key, token })
  }

  return result
}

function bridgeAuthToken(token: string) {
  const current = (window.localStorage.getItem('auth_token') || '').trim()
  if (token && current !== token) {
    window.localStorage.setItem('auth_token', token)
  }
}

function notifyParentAuthExpired(): void {
  try {
    window.top?.postMessage({ type: 'unityshop-auth-expired' }, window.location.origin);
  } catch {
    // Ignore cross-window messaging failures.
  }
}

function getGeminiExecuteEndpoint() {
  const pathname = String(window.location.pathname || '').trim()
  const standalonePrefix = `/standalone/${APP_ID}`
  if (pathname === standalonePrefix || pathname.startsWith(`${standalonePrefix}/`)) {
    return `${standalonePrefix}/api/execute/llm-generate`
  }

  return GEMINI_EXECUTE_ENDPOINT
}

async function fetchWithAuth(url: string, init: RequestInit): Promise<Response | null> {
  const candidates = listAuthTokens()
  if (candidates.length === 0) {
    return null
  }

  for (const { key, token } of candidates) {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)

    const resp = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers,
    })

    if (resp.status === 401) {
      blockedTokenKeys.add(key)
      if (shouldRemoveTokenKeyOnUnauthorized(key)) {
        window.localStorage.removeItem(key)
      }
      continue
    }

    bridgeAuthToken(token)
    return resp
  }

  return null
}

function notifySessionExpired(): void {
  try {
    window.top?.postMessage({ type: 'unityshop-auth-expired' }, window.location.origin);
  } catch {
    // Ignore cross-window messaging failures.
  }
}
function parseJSONSafe(text: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

function pickFirstFiniteNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = Number(source[key])
    if (Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function updateCachedCredits(value: unknown) {
  const next = Number(value)
  if (Number.isFinite(next)) {
    cachedCredits = next
    window.localStorage.setItem(CREDITS_CACHE_KEY, String(next))
  }
}

async function fetchCreditBalance(): Promise<number> {
  const resp = await fetchWithAuth(CREDIT_BALANCE_ENDPOINT, {
    method: 'GET',
  })

  if (!resp) {
    return cachedCredits
  }

  const text = await resp.text()
  const parsed = parseJSONSafe(text)
  if (!resp.ok || parsed.success === false) {
    return cachedCredits
  }

  const data = asRecord(parsed.data) ?? parsed
  const nextCredits = pickFirstFiniteNumber(data, ['credits', 'balance'])
  updateCachedCredits(nextCredits)
  return cachedCredits
}

function openRechargePrompt(): void {
  window.alert('点数不足，请充值');

  try {
    if (window.top) {
      window.top.postMessage(
        {
          type: 'unityshop-open-recharge',
          reason: 'insufficient-credits',
          message: '点数不足，请充值',
        },
        window.location.origin
      );

      if (window.top !== window) {
        return;
      }
    }
  } catch {
    // Ignore cross-window messaging failures and fall back to direct recharge.
  }

  const target = new URL('/pay-service/', window.location.origin);
  target.searchParams.set('openRecharge', '1');
  target.searchParams.set('ui_v', '20260507a');
  window.location.assign(target.toString());
}
function redirectToBillingPage(): void {
  const message = '点数不足，请充值';
  window.alert(message);

  try {
    if (window.top) {
      window.top.postMessage(
        {
          type: 'unityshop-open-recharge',
          reason: 'insufficient-credits',
          message,
        },
        window.location.origin
      );

      if (window.top !== window) {
        return;
      }
    }
  } catch {
    // Fall through to direct recharge page fallback.
  }

  const target = new URL('/pay-service/', window.location.origin);
  target.searchParams.set('openRecharge', '1');
  target.searchParams.set('ui_v', '20260507a');

  try {
    const popup = window.open(target.toString(), `pay_service_recharge_${Date.now()}`, 'popup=yes,width=520,height=860');
    if (popup) {
      popup.focus();
      return;
    }
  } catch {
    // Fall through to current window redirect.
  }

  window.location.assign(target.toString());
}

function normalizeShots(shots: StoryboardShot[]) {
  const sanitized = shots.map((shot, index) => {
    const duration = Number.isFinite(shot.durationSeconds)
      ? Math.max(1, Math.round(shot.durationSeconds))
      : 8

    return {
      ...shot,
      id: Number.isFinite(shot.id) ? shot.id : index + 1,
      durationSeconds: duration,
      sceneDescription: String(shot.sceneDescription || '').trim(),
      imagePrompt: String(shot.imagePrompt || '').trim(),
      videoPrompt: String(shot.videoPrompt || '').trim(),
      note: shot.note ? String(shot.note) : '',
    }
  })

  return sanitized.filter(
    (shot) => shot.sceneDescription && shot.imagePrompt && shot.videoPrompt,
  )
}

function extractJson(content: string) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  return content.trim()
}

function extractFirstJsonObject(content: string) {
  let inString = false
  let escaped = false
  let depth = 0
  let start = -1

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === '}') {
      if (depth === 0) {
        continue
      }

      depth -= 1
      if (depth === 0 && start !== -1) {
        return content.slice(start, index + 1)
      }
    }
  }

  throw new Error('模型响应中未找到完整 JSON。')
}

function parseJsonObject<T>(content: string, errorPrefix: string) {
  const normalized = content.replace(/^\uFEFF/, '').trim()

  try {
    return JSON.parse(normalized) as T
  } catch {
    const extracted = extractJson(normalized)
    const candidate = extractFirstJsonObject(extracted)

    try {
      return JSON.parse(candidate) as T
    } catch (parseError) {
      throw new Error(
        `${errorPrefix}${parseError instanceof Error ? `：${parseError.message}` : '。'}`,
      )
    }
  }
}

function extractTextFromGeminiPayload(payload: GeminiGenerateResponse) {
  const parts = payload.candidates?.[0]?.content?.parts || []
  const text = parts
    .map((part) => part.text || '')
    .join('\n')
    .trim()

  if (!text) {
    throw new Error('模型返回为空。')
  }

  return text
}

function buildSystemPrompt() {
  return [
    '你是一名资深影视编剧与 AI 短剧分镜导演。',
    '你必须把用户故事拆分为连贯的镜头序列，并输出严格的 JSON。',
    '所有输出必须使用中文。',
    '每个镜头 durationSeconds 必须为整数且不能超过 10。',
    '镜头描述必须保证道具、角色外观、空间关系和视角逻辑一致。',
    'imagePrompt 必须完整复述主角外观信息，并遵循视角规则。',
    'videoPrompt 必须描述 5 到 10 秒内可以完成的动作链，强调稳定性要求。',
    '不得输出 markdown，不得输出解释，只能输出 JSON 对象。',
  ].join('\n')
}

function buildUserPrompt(request: StoryboardRequestPayload) {
  return `
请根据以下信息生成分镜脚本：

故事内容：
${request.story}

目标总时长：${request.targetDurationSeconds} 秒
风格：${request.style}
视角：${request.perspective}
角色外观：${request.characterAppearance || '请你根据故事合理补全，但保持稳定、具体、便于跨镜头复用。'}
额外要求：${request.extraRequirements || '无'}

你必须返回如下 JSON 结构：
{
  "title": "作品标题",
  "summary": "故事摘要",
  "totalDurationSeconds": 30,
  "characterProfile": "统一角色外观设定",
  "shots": [
    {
      "id": 1,
      "durationSeconds": 8,
      "sceneDescription": "场景和动作描述",
      "imagePrompt": "完整中文文生图提示词",
      "videoPrompt": "完整中文图生视频提示词",
      "note": "特殊说明"
    }
  ],
  "qualityChecklist": {
    "durationsValidated": true,
    "maxShotDurationSeconds": 10,
    "warnings": []
  }
}

额外硬性要求：
1. 所有镜头 durationSeconds 必须 <= 10。
2. 镜头数量要与总时长匹配，尽量让总和接近目标时长。
3. 所有提示词必须是中文。
4. imagePrompt 格式需体现：景别选择、角色外观、主体描述、环境场景、情绪氛围、视觉风格、光影效果。
5. videoPrompt 格式需体现：镜头描述、镜头运动、主体行为、背景变化、环境变化。
6. 如果使用第一人称视角，不要出现主角正面全貌；如果使用自拍视角，不要出现破坏视角的自拍杆或手持手机描述。
`.trim()
}

function buildQualityChecklist(shots: StoryboardShot[], warnings: string[]) {
  const maxDuration = shots.length
    ? Math.max(...shots.map((shot) => shot.durationSeconds))
    : 0
  const durationsValidated = shots.every((shot) => shot.durationSeconds <= 10)

  return {
    durationsValidated,
    maxShotDurationSeconds: maxDuration,
    warnings,
  }
}

export async function generateStoryboard(payload: StoryboardRequestPayload) {
  const balance = await fetchCreditBalance()
  if (balance < STORYBOARD_COST) {
    redirectToBillingPage()
    throw new Error(`余额不足：生成分镜方案需要 ${STORYBOARD_COST} 积分，请先充值。`)
  }

  const response = await fetchWithAuth(getGeminiExecuteEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Standalone-Suite': APP_ID,
      'X-Standalone-Tool': 'storyboard-generator',
    },
    body: JSON.stringify({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: buildSystemPrompt() },
          { text: buildUserPrompt(payload) },
        ],
      },
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
      task: 'text_gen',
      tier: 'normal',
      standalone_suite: APP_ID,
      standalone_tool: 'storyboard-generator',
    }),
  })

  if (!response) {
    throw new Error('请先登录后再使用分镜生成功能。')
  }

  const rawResponseBody = await response.text()

  if (!response.ok) {
    const fallback = `请求失败：${response.status}`
    let body: { message?: string; details?: string[]; error?: string } | null = null

    try {
      body = parseJsonObject<{ message?: string; details?: string[]; error?: string } | null>(
        rawResponseBody,
        fallback,
      )
    } catch {
      body = null
    }

    const rawMessage = String(body?.message || body?.error || '')
    if (response.status === 409 || /insufficient credits/i.test(rawMessage)) {
      redirectToBillingPage()
      throw new Error(`余额不足：生成分镜方案需要 ${STORYBOARD_COST} 积分，请先充值。`)
    }

    const details = body?.details?.length ? ` ${body.details.join('；')}` : ''
    throw new Error(body?.message || body?.error || `${fallback}${details}`)
  }

  const envelope = parseJsonObject<ExecuteEnvelope<GeminiGenerateResponse>>(
    rawResponseBody,
    '服务返回了无法解析的数据',
  )
  if (envelope.success === false || !envelope.data) {
    throw new Error(envelope.message || envelope.error?.message || '模型请求失败。')
  }

  const rawText = extractTextFromGeminiPayload(envelope.data)
  const parsed = parseJsonObject<StoryboardResponse>(extractJson(rawText), '模型返回 JSON 解析失败')
  const shots = normalizeShots(Array.isArray(parsed.shots) ? parsed.shots : [])

  if (!shots.length) {
    throw new Error('模型返回为空或结构不完整，请重试。')
  }

  const warnings = [...(parsed.qualityChecklist?.warnings || [])]
  if (shots.some((shot) => shot.durationSeconds > 10)) {
    warnings.push('存在超过 10 秒的镜头，请人工复核后调整。')
  }

  await fetchCreditBalance()

  const result: StoryboardResponse = {
    source: 'llm',
    title: parsed.title || '未命名分镜方案',
    summary: parsed.summary || '已生成分镜方案。',
    totalDurationSeconds: shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
    characterProfile: parsed.characterProfile || payload.characterAppearance || '未提供角色设定。',
    shots,
    qualityChecklist: buildQualityChecklist(shots, warnings),
  }

  return result
}
