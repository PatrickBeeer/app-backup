// 器物光场 · 餐饮具 AI 主图工作台
//
// Standalone app frontend. All external AI calls go through the platform
// API Manager (app-manager) using the browser's Bearer session token — no
// provider API key lives in the browser. See:
//   apps/docs/standalone_app_host_handbook.md  (API Manager Contract)
//   apps/services/geminiProxyService.ts        (reference implementation)
//
// Endpoint resolution mirrors geminiProxyService: when loaded from
// /standalone/tea-and-repast/ (inside the main-frontend shell iframe),
// requests target /standalone/tea-and-repast/api/execute/llm-generate so
// app-manager can reserve credits against this app's pricing rule.

// ---------------------------------------------------------------------------
// Model + billing mapping (kept in sync with app_manager.app_pricing).
// app-manager resolves the pricing key from `billing_task` first, then `task`.
// Sending both explicitly avoids the "app pricing rule not found" 400.
// ---------------------------------------------------------------------------
const ANALYSIS_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const TEXT_TASK = 'text_gen';
const IMAGE_TASK = 'image_gen';
const EXECUTE_TIMEOUT_MS = 300000;
// Browser-level retry for transient upstream failures (502/503/504/network).
// app-manager already retries the upstream twice (1.2s/2.4s); when all three
// land in a flaky window the browser still sees 502. These retries span the
// observed ~7s upstream recovery window. See standalone_app_host_handbook.md
// failure mode E ("add retry/backoff in frontend generation calls").
const TRANSIENT_RETRY_DELAYS_MS = [2500, 5000];
const TRANSIENT_STATUS_SET = new Set([502, 503, 504, 429]);

function isTransientStatus(status) {
  return TRANSIENT_STATUS_SET.has(status);
}

// 五张主图逻辑：[编号, 标题, 副标题, 摄影规格说明]
const frameSpecs = [
  ['01', '黑底透光器型细节', '手持展示釉色与轮廓', '参考黑色背景中的手持细节摄影，从器物侧面或底部以 25-45 度角展示透光釉色、口沿、纹样和轮廓，手指只作为尺度参照；禁止正上方俯拍。'],
  ['02', '一致餐桌生活场景', '不同器型同桌使用', '参考自然窗边的深色木质餐桌生活场景。画面中放入主产品以及 2-4 个不同尺寸、不同深浅、不同用途但同系列的碗、盘、杯或茶具，搭配真实食物和自然的人手使用；同一组餐桌必须保持桌面材质、窗光方向、背景色和摄影色温一致。'],
  ['03', '自然材质环境陈列', '木头与砂石的器物组合', '参考沙地、枯木、石材等自然材质环境，把主产品与 2-3 个不同器型的同类器物组合陈列，形成自然纹理和器物釉面之间的对比；不是餐桌，不要添加桌椅。'],
  ['04', '黑底工艺细节', '底部纹样与釉面工艺', '参考黑色背景的工艺展示，器物翻转展示底部、纹样、釉面和边缘，采用强轮廓光与局部高光，保留干净黑色留白；画面可以使用正上方或正对底部的产品展示角度。'],
  ['05', '礼盒套装陈列', '不同尺寸的完整组合', '参考深红木质礼盒或收纳盒中的套装平铺，必须同时展示大碗、小碗、盘、杯、勺或茶具中不同用途的器物，器型要有差异但保持同系列颜色和纹样，加入高级灰内衬和暖色边框，强调礼赠与收藏感。'],
];

// ---------------------------------------------------------------------------
// API Manager client (vanilla-JS port of apps/services/geminiProxyService.ts)
// ---------------------------------------------------------------------------
const AUTH_TOKEN_KEYS = ['auth_token', 'user_manager_token', 'unityshop-main-frontend-token', 'admin_token'];
const STANDALONE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function listAuthTokenCandidates() {
  const seen = new Set();
  const result = [];
  for (const key of AUTH_TOKEN_KEYS) {
    const token = (localStorage.getItem(key) || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    result.push({ key, token });
  }
  return result;
}

function bridgeWorkingToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) return;
  const current = (localStorage.getItem('auth_token') || '').trim();
  if (current !== trimmed) localStorage.setItem('auth_token', trimmed);
}

function resolveStandaloneAppID() {
  if (typeof window === 'undefined' || !window.location) return null;
  const match = String(window.location.pathname || '').match(/^\/standalone\/([^/]+)(?:\/|$)/);
  const candidate = decodeURIComponent(String(match?.[1] || '')).trim();
  if (!candidate || !STANDALONE_APP_ID_PATTERN.test(candidate)) return null;
  return candidate;
}

function getLLMExecuteEndpoint() {
  const appId = resolveStandaloneAppID();
  if (!appId) return '/api_manager/api/v1/execute/llm-generate';
  return `/standalone/${encodeURIComponent(appId)}/api/execute/llm-generate`;
}

async function fetchWithAuthFallback(url, init) {
  const candidates = listAuthTokenCandidates();
  const attempts = candidates.length > 0 ? candidates : [{ key: null, token: '' }];
  let lastResponse = null;
  for (const candidate of attempts) {
    const headers = new Headers(init.headers);
    if (candidate.token) headers.set('Authorization', `Bearer ${candidate.token}`);
    else headers.delete('Authorization');
    const response = await fetch(url, { ...init, headers });
    // 401 → drop the candidate token and try the next one.
    if (response.status === 401 && candidate.key) {
      if (candidate.key === 'auth_token' || candidate.key === 'admin_token') {
        localStorage.removeItem(candidate.key);
      }
      lastResponse = response;
      continue;
    }
    if (response.ok && candidate.token) bridgeWorkingToken(candidate.token);
    return response;
  }
  return lastResponse ?? fetch(url, init);
}

// One upstream attempt. Tags thrown errors with `transient` so the retry loop
// can decide whether to back off and try again.
async function generateContentOnce(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS);
  let response;
  try {
    response = await fetchWithAuthFallback(getLLMExecuteEndpoint(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    // Network failure or abort (timeout) → transient, retryable.
    const wrapped = new Error(`网络请求失败：${error.name === 'AbortError' ? '请求超时' : (error.message || '网络错误')}`);
    wrapped.transient = true;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch {
      const preview = text.replace(/\s+/g, ' ').trim().slice(0, 160);
      const err = new Error(`非 JSON 响应（HTTP ${response.status}）：${preview}`);
      err.status = response.status;
      err.transient = isTransientStatus(response.status);
      throw err;
    }
  }
  if (!response.ok) {
    const err = new Error(String(payload?.error || payload?.message || `HTTP ${response.status}`));
    err.status = response.status;
    err.transient = isTransientStatus(response.status);
    throw err;
  }
  // Unwrap { success, data } envelope if present.
  if (payload?.success === false) throw new Error(String(payload?.error || payload?.message || '请求失败'));
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  return payload;
}

async function generateContent(request) {
  let lastError;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await generateContentOnce(request);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < TRANSIENT_RETRY_DELAYS_MS.length && error.transient;
      if (!canRetry) {
        if (error.transient) {
          throw new Error(`图片模型暂时不可用（${error.status || '网络'}），请稍后重试`);
        }
        throw error;
      }
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
      console.warn(`[tea-and-repast] 生成请求遇到临时错误（HTTP ${error.status || '网络'}），${Math.round(delay / 1000)}s 后重试（第 ${attempt + 1}/${TRANSIENT_RETRY_DELAYS_MS.length} 次）…`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Prompt building (ported from the former server.mjs).
// ---------------------------------------------------------------------------
function dataUrlToPart(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl || '');
  if (!match) throw new Error('参考图必须是 PNG、JPG 或 WEBP 的 data URL');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function imageParts(images = []) {
  return images.map(image => dataUrlToPart(image.dataUrl));
}

function responseText(payload) {
  return (payload?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function responseImage(payload) {
  const parts = (payload?.candidates || []).flatMap(candidate => candidate?.content?.parts || []);
  const imagePart = parts.find(part => part.inlineData?.data || part.inline_data?.data);
  if (!imagePart) return null;
  const data = imagePart.inlineData || imagePart.inline_data;
  return `data:${data.mimeType || data.mime_type || 'image/png'};base64,${data.data}`;
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
}

function imagePrompt({ category, ratio, resolution = '2K', analysis, spec, userPrompt = '' }) {
  const color = (analysis?.colors || []).join(', ');
  const tableRule = spec[0] === '02'
    ? '这是本组唯一明确的餐桌生活场景之一；桌面颜色必须根据产品色彩选择，并且最多只允许本组 2 张主图使用餐桌场景。浅青/白瓷优先深色木桌或蓝灰石材，暖色陶土优先浅灰石材或深棕木桌，深色器物优先浅色石材；不要让桌面颜色吞没产品。'
    : '不要生成餐桌场景，避免与餐桌主图重复。';
  const scaleRule = spec[0] === '01' || spec[0] === '04'
    ? '这是近距离产品细节图，主产品应占画面约 65%-85%，边缘完整、细节可辨。'
    : spec[0] === '02'
      ? '这是餐桌生活场景，不要把产品放得过大；让主产品和不同器型的同类器物共同形成完整餐桌关系，主产品约占画面 25%-45%，但必须清晰可辨。'
      : spec[0] === '03'
        ? '这是自然材质环境陈列，产品与木头、砂石共同构图，单个器物不必占满画面，整体器物组合约占画面 45%-65%，保持环境氛围。'
        : '这是礼盒套装陈列，整套器物组合约占画面 55%-75%，每个器物都要有足够尺寸和清晰轮廓，不能只剩小图标般的摆件。';
  return `为中国电商餐饮具生成一张高质感真实商业摄影图。产品类目：${category}。输出清晰度：${resolution}。画幅比例：${ratio}。这是五张主图逻辑中的第 ${spec[0]} 张，主题为“${spec[1]}”：${spec[3]}\n\n用户补充要求：${userPrompt || '无，请严格按照本张主图逻辑生成。'}\n\n主体尺度要求：${scaleRule}\n\n产品一致性要求：输入图片中的产品是主产品参考，必须严格保留真实器型、比例、轮廓、颜色、纹样和材质。碗必须保持真实圆形或原始器型，口沿必须均匀，碗壁厚度和深度必须稳定，不能被拉成椭圆、不能塌陷、不能融化、不能扭曲、不能出现波浪变形、不能改变长宽比例。主产品不能被复制成同一个碗重复摆放；需要组合时，必须生成 2-4 个同类型但尺寸、深浅、用途或器型不同的辅助器物，例如大碗、小碗、浅盘、深盘、杯、勺、茶壶或茶杯，保持同系列色彩与材质但形状有明确差异。\n\n视角锁定要求：严格保持上传参考图中的相机视角、器物朝向、透视关系和观察高度；不得为了生成场景而旋转、翻转、换角度、改变拍摄方向或改成另一种视角。\n\n场景一致性：${tableRule}\n\n镜头与摄影要求：第 1 张只允许平视或约 25-45 度侧面角度，禁止正上方垂直俯拍；所有器物轮廓必须清晰，透视自然。使用强定向光、边缘轮廓光、釉面高光、真实反射、细腻接触阴影和高级商业摄影质感；画面构图必须服务于“${spec[2]}”，不要做普通白底抠图。\n\n绝对禁止生成任何文字：禁止中文、英文、数字、品牌名、Logo、水印、标签、标题、卖点说明、价格、图标、信息图和排版；任何留白都必须保持为空白画面。禁止模糊乱码来代替文字。${spec[0] === '02' ? '允许出现自然的人手或用餐动作，但禁止可识别面孔。' : ''}\n\n视觉 DNA：材质=${analysis?.material || '以参考图为准'}；代表色=${color}；标签=${(analysis?.tags || []).join('、')}。`;
}

async function analyze({ images = [] }) {
  const prompt = `你是一名餐饮具电商视觉分析师。请分析这些参考图中的餐饮具，只输出 JSON，不要 markdown。JSON 字段必须为：category（只能是“碗”“盘”“茶具”三者之一，按主体器物判断）、material（中文材质名）、colors（4 个代表色的 HEX 数组）、tags（3-5 个中文短标签）、confidence（例如 94%）。重点判断真实色彩、釉面/陶土/瓷器质感、光泽强度、器型稳定性。不要臆造品牌或文字。`;
  const payload = await generateContent({
    model: ANALYSIS_MODEL,
    task: TEXT_TASK,
    billing_task: TEXT_TASK,
    contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts(images)] }],
    config: { responseMimeType: 'application/json' },
  });
  const parsed = parseJson(responseText(payload));
  if (!parsed) throw new Error('分析接口返回了无法解析的结果');
  return {
    category: ['碗', '盘', '茶具'].includes(parsed.category) ? parsed.category : '餐饮具',
    material: parsed.material || '器物釉面',
    colors: Array.isArray(parsed.colors) ? parsed.colors.slice(0, 4) : ['#263830', '#74908A', '#C6C1A8', '#E7D8B1'],
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : ['釉面光泽', '器型稳定', '高光边缘'],
    confidence: parsed.confidence || '—',
  };
}

async function generateOne({ frameIndex = 0, references = [], category = '碗', ratio = '1:1', resolution = '2K', analysis, userPrompt = '' }) {
  const spec = frameSpecs[Math.max(0, Math.min(frameSpecs.length - 1, Number(frameIndex)))];
  const payload = await generateContent({
    model: IMAGE_MODEL,
    task: IMAGE_TASK,
    billing_task: IMAGE_TASK,
    contents: [{ role: 'user', parts: [{ text: imagePrompt({ category, ratio, resolution, analysis, spec, userPrompt }) }, ...imageParts(references)] }],
    config: { imageConfig: { aspectRatio: ratio, imageSize: resolution } },
  });
  const image = responseImage(payload);
  if (!image) throw new Error(`第 ${spec[0]} 张没有返回图片结果`);
  return { frame: { id: spec[0], title: spec[1], subtitle: spec[2], image, status: 'ready' }, hasNext: Number(frameIndex) < frameSpecs.length - 1 };
}

async function regenerate({ frameId, prompt, references = [], category = '碗', ratio = '1:1', resolution = '2K' }) {
  const spec = frameSpecs.find(item => item[0] === frameId) || frameSpecs[0];
  const fullPrompt = `${imagePrompt({ category, ratio, resolution, analysis: null, spec, userPrompt: prompt })}\n\n用户对这一张的修改要求：${prompt}`;
  const payload = await generateContent({
    model: IMAGE_MODEL,
    task: IMAGE_TASK,
    billing_task: IMAGE_TASK,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }, ...imageParts(references)] }],
    config: { imageConfig: { aspectRatio: ratio, imageSize: resolution } },
  });
  const image = responseImage(payload);
  if (!image) throw new Error('重新生成没有返回图片结果');
  return { id: spec[0], title: spec[1], subtitle: spec[2], image, status: 'ready' };
}

// ---------------------------------------------------------------------------
// UI state + DOM (unchanged app logic; service now calls api-manager above).
// ---------------------------------------------------------------------------
const state = { references: [], category: '碗', ratio: '1:1', resolution: '2K', analysis: null, frames: [], activeFrame: null, history: null, nextFrameIndex: 0 };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const fileInput = $('#fileInput'), uploadZone = $('#uploadZone'), uploadError = $('#uploadError'), referenceList = $('#referenceList'), generateButton = $('#generateButton');

const service = {
  async analyzeReferences(images) {
    return analyze({ images: images.map(({ url, name }) => ({ dataUrl: url, name })) });
  },
  async generateOne(payload) {
    return generateOne({
      frameIndex: payload.frameIndex,
      references: payload.references.map(({ url, name }) => ({ dataUrl: url, name })),
      category: payload.category,
      ratio: payload.ratio,
      resolution: payload.resolution,
      analysis: payload.analysis,
      userPrompt: payload.userPrompt,
    });
  },
  async regenerateImage(id, prompt) {
    return regenerate({
      frameId: id,
      prompt,
      category: state.category,
      ratio: state.ratio,
      resolution: state.resolution,
      references: state.references.map(({ url, name }) => ({ dataUrl: url, name })),
    });
  },
};

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function shortFileName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.length > 13 ? `${base.slice(0, 13)}…${ext}` : name;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function fileSize(bytes) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderReferences() {
  referenceList.innerHTML = state.references.map((file, index) => `<div class="reference-item"><img class="reference-thumb" src="${file.url}" alt="参考图 ${index + 1}"/><div class="reference-info"><span class="reference-name" title="${escapeHtml(file.name)}">${escapeHtml(shortFileName(file.name))}</span><span class="reference-meta">REF ${String(index + 1).padStart(2, '0')} · ${file.size}</span></div><button class="remove-reference" type="button" data-remove="${index}" aria-label="移除第 ${index + 1} 张参考图">×</button></div>`).join('');
  $('#uploadCount').textContent = `${state.references.length} / 3`;
  generateButton.disabled = state.references.length === 0;
  $$('[data-remove]').forEach(button => button.addEventListener('click', () => {
    state.references.splice(Number(button.dataset.remove), 1);
    renderReferences();
    if (!state.references.length) resetAnalysis();
  }));
}

function handleFiles(files) {
  uploadError.textContent = '';
  const incoming = [...files];
  if (state.references.length + incoming.length > 3) { uploadError.textContent = '最多上传 3 张参考图，请减少后再试。'; return; }
  const valid = incoming.filter(file => {
    if (file.size > 10485760) { uploadError.textContent = '单张图片不能超过 10MB。'; return false; }
    return /^image\/(png|jpeg|webp)$/.test(file.type);
  });
  valid.forEach(file => {
    const reader = new FileReader();
    reader.onload = event => {
      state.references.push({ name: file.name, size: fileSize(file.size), url: event.target.result });
      renderReferences();
      if (state.references.length === 1) runAnalysis();
    };
    reader.readAsDataURL(file);
  });
}

function resetAnalysis() {
  state.analysis = null;
  state.category = '碗';
  state.frames = [];
  state.nextFrameIndex = 0;
  $('#generateButtonLabel').textContent = '点击生成 · 10 积分/张';
  $('#detectedCategory').textContent = '后台等待参考图';
  $('#detectedCategoryBlock .detected-category-value').classList.remove('is-detected');
  $('#analysisCard').innerHTML = '<div class="analysis-placeholder"><span class="pulse-ring"></span><p>等待参考图分析</p><small>上传后将在后台自动提取色彩与材质</small></div>';
  $('#generationStatus').textContent = '等待参考素材';
  $('#nextFrameButton').hidden = true;
  $('#downloadButton').disabled = true;
  $('#outputCount').textContent = '0';
}

async function runAnalysis() {
  const card = $('#analysisCard');
  $('#detectedCategory').textContent = '后台识别中…';
  card.innerHTML = '<div class="analysis-placeholder"><span class="pulse-ring"></span><p>后台读取视觉 DNA…</p><small>类目 / 色彩 / 材质 / 器型</small></div>';
  try {
    state.analysis = await service.analyzeReferences(state.references);
    state.category = state.analysis.category || '餐饮具';
    $('#detectedCategory').textContent = state.category;
    $('#detectedCategoryBlock .detected-category-value').classList.add('is-detected');
    renderAnalysis();
    $('#generationStatus').textContent = `已识别为${state.category} · 可以生成`;
  } catch (error) {
    card.innerHTML = '<div class="analysis-placeholder"><span class="pulse-ring"></span><p>后台分析暂时不可用</p><small>可继续生成，稍后自动重试</small></div>';
    $('#generationStatus').textContent = '等待后台分析';
    showToast(error.message);
  }
}

function renderAnalysis() {
  const a = state.analysis;
  $('#analysisCard').innerHTML = `<div class="analysis-data"><div class="analysis-top"><div><p class="material-name">${a.material}</p><p class="material-copy">${a.category} · 高光釉面 · ${a.confidence} 匹配度</p></div><span class="mono" style="color:var(--lime)">SCAN OK</span></div><div class="analysis-swatch-row">${a.colors.map(color => `<span class="swatch" style="background:${color}"></span>`).join('')}</div><div class="analysis-tags">${a.tags.map(tag => `<span class="analysis-tag">${tag}</span>`).join('')}</div></div>`;
}

function renderSkeletons() {
  const portrait = ['3:4'].includes(state.ratio);
  const landscape = ['9:16', '16:9'].includes(state.ratio);
  const aspect = state.ratio === '3:4' ? '3/4' : state.ratio === '9:16' ? '9/16' : state.ratio === '16:9' ? '16/9' : '1/1';
  $('#emptyState')?.remove();
  $('#resultGrid').innerHTML = frameSpecs.map((_, i) => `<article class="skeleton-card" style="animation-delay:${i * 80}ms"><div class="skeleton-image ${portrait ? 'portrait' : landscape ? 'landscape' : ''}" style="aspect-ratio:${aspect}"></div><div class="skeleton-copy"><span class="skeleton-title"></span><span class="skeleton-line"></span></div></article>`).join('');
}

async function generateFrame(index) {
  if (!state.references.length || index > frameSpecs.length - 1) return;
  const nextButton = $('#nextFrameButton');
  nextButton.disabled = true;
  if (index === 0) { state.frames = []; renderSkeletons(); }
  state.frames[index] = { id: frameSpecs[index][0], title: frameSpecs[index][1], subtitle: frameSpecs[index][2], status: 'loading' };
  renderFrames();
  $('#generationStatus').textContent = `正在生成图 ${index + 1} / 5 · 请确认后继续`;
  try {
    const result = await service.generateOne({ frameIndex: index, references: state.references, category: state.category, ratio: state.ratio, resolution: state.resolution, analysis: state.analysis, userPrompt: $('#globalPrompt').value.trim() });
    state.frames[index] = result.frame;
    state.nextFrameIndex = index + 1;
    $('#generateButtonLabel').textContent = '继续生成 · 10 积分/张';
    renderFrames();
    $('#generationStatus').textContent = index === frameSpecs.length - 1 ? '5 张主图已完成' : '图 ' + (index + 1) + ' 已生成 · 请确认后继续';
    $('#downloadButton').disabled = false;
    $('#outputCount').textContent = String(state.frames.filter(frame => frame?.image).length);
    nextButton.hidden = index === frameSpecs.length - 1;
    if (index < frameSpecs.length - 1) nextButton.disabled = false;
    else showToast('5 张主图已全部生成');
  } catch (error) {
    state.frames[index].status = 'error';
    renderFrames();
    $('#generationStatus').textContent = `图 ${index + 1} 生成失败`;
    showToast(error.message);
    nextButton.hidden = true;
  }
}

function generate() { generateFrame(state.nextFrameIndex); }

async function generateAllRemaining() {
  const button = $('#nextFrameButton');
  button.disabled = true;
  while (state.nextFrameIndex < frameSpecs.length) {
    const index = state.nextFrameIndex;
    await generateFrame(index);
    if (!state.frames[index]?.image) break;
  }
  button.hidden = true;
  button.disabled = false;
}

function renderFrames() {
  const portrait = state.ratio === '3:4';
  const landscape = ['9:16', '16:9'].includes(state.ratio);
  const aspect = state.ratio === '3:4' ? '3/4' : state.ratio === '9:16' ? '9/16' : state.ratio === '16:9' ? '16/9' : '1/1';
  $('#resultGrid').innerHTML = state.frames.map((frame, i) => frame.status === 'loading'
    ? `<article class="skeleton-card"><div class="skeleton-image ${portrait ? 'portrait' : landscape ? 'landscape' : ''}" style="aspect-ratio:${aspect}"></div><div class="skeleton-copy"><span class="skeleton-title"></span><span class="skeleton-line"></span></div></article>`
    : `<article class="result-card is-ready" data-frame="${frame.id}" tabindex="0" role="button" aria-label="打开${frame.title}编辑" style="animation:rise .35s ${i * 60}ms both"><div class="result-image ${portrait ? 'portrait' : landscape ? 'landscape' : ''}" style="aspect-ratio:${aspect}">${frame.image ? `<img src="${frame.image}" alt="${escapeHtml(frame.title)}"/>` : `<div class="result-art result-art-${i}"><span></span></div>`}<div class="image-overlay"><span class="edit-label">点击放大编辑</span><span class="zoom-icon">⌕</span></div></div><div class="result-copy"><strong>${frame.title}</strong><span>${frame.id} / ${state.ratio}</span></div></article>`).join('');
}

function renderEditorPreview(frame) {
  const preview = $('#editPreview');
  const media = frame.image ? `<img src="${frame.image}" alt="${escapeHtml(frame.title)} 预览图"/>` : '<div class="preview-skeleton"><i></i><i></i><i></i></div>';
  preview.innerHTML = `${media}<span class="preview-ratio" id="previewRatio">${state.ratio.replace(':', ' : ')}</span>`;
}

function openEditor(id) {
  const frame = state.frames.find(item => item.id === id);
  if (!frame) return;
  const modal = $('#editModal');
  state.activeFrame = frame;
  state.history = null;
  $('#modalFrameNumber').textContent = frame.id;
  $('#editTitle').textContent = frame.title;
  $('#editSubtitle').textContent = frame.subtitle + '。保留器型与色彩，可调整光线、背景与构图。';
  renderEditorPreview(frame);
  $('#editPrompt').value = '';
  $('#modalStatus').textContent = '';
  $('#undoButton').disabled = true;
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#closeModal').focus());
}

async function regenerateActive() {
  if (!state.activeFrame) return;
  const prompt = $('#editPrompt').value.trim();
  if (!prompt) { showToast('先写下你希望调整的光感或场景'); $('#editPrompt').focus(); return; }
  const button = $('#regenerateButton');
  button.disabled = true;
  $('#modalStatus').textContent = '正在重新布光…';
  state.history = { ...state.activeFrame };
  try {
    const next = await service.regenerateImage(state.activeFrame.id, prompt);
    Object.assign(state.activeFrame, next, { status: 'ready', prompt });
    renderFrames();
    renderEditorPreview(state.activeFrame);
    $('#modalStatus').textContent = '已生成新版本 · 保留上一版';
    $('#undoButton').disabled = false;
    showToast('这一张已更新');
  } catch (error) {
    $('#modalStatus').textContent = '重做失败';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function closeEditor() {
  const modal = $('#editModal');
  modal.setAttribute('hidden', '');
  modal.setAttribute('aria-hidden', 'true');
  state.activeFrame = null;
  state.history = null;
  document.activeElement?.blur();
}

async function downloadAll() {
  if (!state.frames.length) return;
  const loaded = state.frames.filter(frame => frame.image);
  if (!loaded.length) { showToast('当前没有可下载的图片结果'); return; }
  for (const frame of loaded) {
    const link = document.createElement('a');
    link.href = frame.image;
    link.download = `器物光场-${frame.id}-${frame.title}.png`;
    link.click();
    await wait(120);
  }
  showToast(`已开始下载 ${loaded.length} 张主图`);
}

fileInput.addEventListener('change', e => handleFiles(e.target.files));
uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('is-dragging'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragging'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('is-dragging'); handleFiles(e.dataTransfer.files); });
generateButton.addEventListener('click', generate);
$('#downloadButton').addEventListener('click', downloadAll);
$('#closeModal').addEventListener('click', closeEditor);
$('#editModal').addEventListener('click', e => { if (e.target.id === 'editModal') closeEditor(); });
$('#regenerateButton').addEventListener('click', regenerateActive);
$('#undoButton').addEventListener('click', () => { if (state.history) { state.activeFrame = state.history; state.history = null; $('#undoButton').disabled = true; $('#modalStatus').textContent = '已撤销到上一版'; showToast('已恢复上一版'); } });
$('#editPrompt').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') regenerateActive(); });
$$('.edit-presets button').forEach(button => button.addEventListener('click', () => { $('#editPrompt').value = button.dataset.prompt; }));
$$('.ratio-option').forEach(button => button.addEventListener('click', () => {
  $$('.ratio-option').forEach(item => item.classList.remove('is-active'));
  button.classList.add('is-active');
  state.ratio = button.dataset.ratio;
  $('#ratioLabel').textContent = `· ${state.ratio}`;
  $('#previewRatio').textContent = state.ratio.replace(':', ' : ');
  if (state.frames.length) renderFrames();
}));
$$('.resolution-option').forEach(button => button.addEventListener('click', () => {
  $$('.resolution-option').forEach(item => item.classList.remove('is-active'));
  button.classList.add('is-active');
  state.resolution = button.dataset.resolution;
}));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#editModal').hidden) closeEditor(); });
$('#nextFrameButton').addEventListener('click', generateAllRemaining);
$('#resultGrid').addEventListener('click', event => { const card = event.target.closest('[data-frame]'); if (!card) return; event.preventDefault(); openEditor(card.dataset.frame); });
$('#resultGrid').addEventListener('keydown', event => { const card = event.target.closest('[data-frame]'); if (!card || (event.key !== 'Enter' && event.key !== ' ')) return; event.preventDefault(); openEditor(card.dataset.frame); });
