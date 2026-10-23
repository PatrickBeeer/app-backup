import { presenterFormState } from './presenter-form.js';
import { buildScriptEditorState } from './script-editor.js';

const state = {
  health: { demoMode: true },
  projects: [],
  current: null,
  view: 'home',
  busy: false,
  scriptDrafts: {},
  pollTimer: null
};

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');

const statusLabels = {
  DRAFT: '待分析', ANALYZING: '分析中', READY_TO_CONFIRM: '待确认', GENERATING: '生成中',
  NEEDS_REVIEW: '待审核', READY_TO_RENDER: '可合成', RENDERING: '合成中', COMPLETED: '已完成', FAILED: '出现问题',
  PENDING: '等待提交', SUBMITTING: '正在发布素材', QUEUED: '云端排队', RUNNING: '生成中', DOWNLOADING: '正在下载',
  REVIEW_REQUIRED: '需要审核', ACCEPTED: '已接受'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function seconds(value) {
  const total = Number(value || 0);
  const minutes = Math.floor(total / 60);
  const rest = (total % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
}

/** 估算视频生成总积分：每秒费率 × 所有生成单元时长之和。 */
function estimateVideoCost(generationUnits) {
  const perSecond = Number(state.health?.videoCostPerSecond || 0);
  if (!perSecond) return '—';
  const totalSeconds = (generationUnits || []).reduce((sum, unit) => sum + Math.max(1, Math.floor(Number(unit.requestDuration || 0))), 0);
  return String(perSecond * totalSeconds);
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const AUTH_TOKEN_KEYS = ['auth_token', 'user_manager_token', 'unityshop-main-frontend-token', 'admin_token'];

function readAuthToken() {
  for (const key of AUTH_TOKEN_KEYS) {
    const value = localStorage.getItem(key);
    if (value && value.trim()) return value.trim();
  }
  return '';
}

async function api(url, options = {}) {
  const token = readAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401) {
    for (const key of AUTH_TOKEN_KEYS) localStorage.removeItem(key);
    throw new Error('登录已过期，请刷新页面后重试');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

function toast(message, error = false) {
  toastElement.textContent = message;
  toastElement.className = error ? 'show error' : 'show';
  clearTimeout(toastElement._timer);
  toastElement._timer = setTimeout(() => { toastElement.className = ''; }, 3600);
}

function statusPill(status) {
  const good = ['COMPLETED', 'READY_TO_RENDER', 'ACCEPTED'].includes(status);
  const problem = ['FAILED', 'NEEDS_REVIEW', 'REVIEW_REQUIRED'].includes(status);
  return `<span class="status-pill ${good ? 'good' : ''} ${problem ? 'problem' : ''}">${escapeHtml(statusLabels[status] || status)}</span>`;
}

function sidebar() {
  return `
    <aside class="sidebar">
      <div class="sidebar-head"><span>项目</span><span>${state.projects.length}</span></div>
      <div class="project-list">
        ${state.projects.length ? state.projects.map((project) => `
          <button class="project-link ${state.current?.id === project.id ? 'active' : ''}" data-action="open-project" data-id="${project.id}">
            <strong>${escapeHtml(project.name)}</strong>
            <span>${escapeHtml(statusLabels[project.status] || project.status)} · ${dateLabel(project.updatedAt)}</span>
          </button>`).join('') : '<p class="sidebar-empty">还没有项目。先上传一条参考视频，建立第一条复刻任务。</p>'}
      </div>
    </aside>`;
}

function shell(main) {
  return `
    <div class="workspace">
      <header class="topbar">
        <button class="brand" data-action="home" aria-label="返回项目首页">
          <span class="brand-mark">刻</span>
          <span><strong>镜刻</strong><small>JINGKE VIDEO REPLICA</small></span>
        </button>
        <div class="topbar-actions">
          <span class="mode-pill">${state.health.demoMode ? '演示模式 · 零扣费' : '真实生成模式'}</span>
          <button class="btn small hot" data-action="new-project">新建复刻</button>
        </div>
      </header>
      ${sidebar()}
      <main class="main"><div class="content">${main}</div></main>
    </div>`;
}

function homeView() {
  return `
    <div class="hero-grid">
      <section class="hero-copy">
        <p class="eyebrow">Structure-locked commerce video</p>
        <h1>不是模仿灵感，<br>是对齐整条时间线。</h1>
        <p class="lead">上传爆款参考视频和新商品资料，可指定授权成年模特，也可在 15 秒内由模型生成人物。镜刻自动拆镜、改写口播，用 Seedance 2.0 原生生成人声、口型、音乐与音效。</p>
        <div class="feature-strip">
          <div><strong>1:1</strong><span>镜头结构与节奏目标</span></div>
          <div><strong>4–15s</strong><span>多模态生成单元</span></div>
          <div><strong>720p</strong><span>横屏或竖屏成片</span></div>
        </div>
      </section>
      ${createForm()}
    </div>`;
}

function createForm() {
  return `
    <form id="create-project-form" class="panel" enctype="multipart/form-data">
      <p class="eyebrow">01 / 建立素材包</p>
      <h2>新建复刻项目</h2>
      <p class="muted">参考片只提供结构，输出人物来自你上传的授权照片。</p>
      <div class="form-grid">
        <div class="field full"><label for="name">项目名称</label><input id="name" name="name" type="text" placeholder="例如：便携榨汁杯 45 秒复刻" required></div>
        <div class="field full">
          <span class="field-label">输出画幅</span>
          <div class="ratio-switch">
            <span class="ratio-option"><input id="ratio-vertical" name="ratio" value="9:16" type="radio" checked><label for="ratio-vertical">9:16 竖屏</label></span>
            <span class="ratio-option"><input id="ratio-horizontal" name="ratio" value="16:9" type="radio"><label for="ratio-horizontal">16:9 横屏</label></span>
          </div>
        </div>
        <div class="field full"><label class="file-field"><input name="referenceVideo" type="file" accept="video/mp4,video/quicktime,video/webm" required><strong>上传参考视频（不限时长）</strong><span>MP4 / MOV / WebM，最大 200 MB</span></label></div>
        <div class="field full">
          <span class="field-label">人物来源</span>
          <div class="presenter-switch">
            <span class="presenter-option"><input id="presenter-reference" name="presenterMode" value="reference" type="radio" checked><label for="presenter-reference"><strong>使用指定模特</strong><small>适合长视频与跨片段人物一致</small></label></span>
            <span class="presenter-option"><input id="presenter-generated" name="presenterMode" value="generated" type="radio"><label for="presenter-generated"><strong>由模型生成人物</strong><small>仅适用于 15 秒以内的参考视频</small></label></span>
          </div>
          <small id="presenter-guidance" class="presenter-guidance">上传 1–5 张同一位成年模特照片</small>
        </div>
        <div class="field" id="person-upload-field"><label class="file-field"><input name="personPhotos" type="file" accept="image/*" multiple required><strong>上传 1–5 张成年人物照片</strong><span>至少包含一张清晰面容照片；避免校服与学生标识</span></label></div>
        <div class="field" id="product-upload-field"><label class="file-field"><input name="productImages" type="file" accept="image/*" multiple required><strong>上传商品图片</strong><span>1–9 张，覆盖关键角度</span></label></div>
        <div class="field full"><label for="productName">商品名称</label><input id="productName" name="productName" type="text" placeholder="便携榨汁杯" required></div>
        <div class="field"><label for="price">价格信息</label><input id="price" name="price" type="text" placeholder="到手 129 元"></div>
        <div class="field"><label for="specifications">规格参数</label><textarea id="specifications" name="specifications" placeholder="每行一项，例如：容量 450mL"></textarea></div>
        <div class="field"><label for="sellingPoints">核心卖点</label><textarea id="sellingPoints" name="sellingPoints" placeholder="每行一项，例如：40 秒快速榨汁" required></textarea></div>
        <div class="field"><label for="requiredClaims">必须出现</label><textarea id="requiredClaims" name="requiredClaims" placeholder="食品接触级材质"></textarea></div>
        <div class="field full"><label for="forbiddenClaims">禁止表达</label><textarea id="forbiddenClaims" name="forbiddenClaims" placeholder="全网最低价&#10;绝对不坏"></textarea><small>应用会把这些词作为硬性约束传入分析和生成流程。</small></div>
      </div>
      <div class="button-row"><button class="btn hot" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '<i class="spinner"></i>正在上传…' : '建立项目并保存素材'}</button></div>
    </form>`;
}

function projectHeader(project, eyebrow = 'Replication workspace') {
  return `
    <div class="section-head">
      <div><p class="eyebrow">${eyebrow}</p><h2>${escapeHtml(project.name)}</h2><div class="meta-row">${statusPill(project.status)}<span class="count-pill">${project.ratio}</span><span class="count-pill">720p</span></div></div>
      <button class="btn ghost" data-action="home">返回项目列表</button>
    </div>`;
}

function draftView(project) {
  const media = project.media || {};
  return `
    ${projectHeader(project, '02 / 自动拆解参考片')}
    ${project.error ? `<div class="card" style="border-color:#ee4e36;margin-bottom:18px"><strong>上次分析未完成</strong><p class="muted">${escapeHtml(project.error)}</p></div>` : ''}
    <div class="media-summary">
      <div class="video-frame ${project.ratio === '9:16' ? 'vertical' : ''}"><video src="${media.referenceVideo || ''}" controls preload="metadata"></video></div>
      <section class="panel">
        <h3>素材检查</h3>
        <p class="muted">分析会自动检测切镜、语音停顿、字幕区域和商品展示动作，并组合成合法的 4–15 秒生成单元。</p>
        <div class="stats-grid">
          <div class="stat"><strong>${project.personPhotos.length}</strong><span>人物照片</span></div>
          <div class="stat"><strong>${project.productImages.length}</strong><span>商品图片</span></div>
          <div class="stat"><strong>${project.ratio}</strong><span>输出画幅</span></div>
          <div class="stat"><strong>1</strong><span>最终成片</span></div>
        </div>
        <h3>人物来源</h3>${(media.personPhotos || []).length
          ? `<div class="asset-grid">${media.personPhotos.map((url) => `<img src="${url}" alt="人物参考照片">`).join('')}</div>`
          : '<p class="muted">无指定模特：将由模型生成一位明确成年的带货人物。</p>'}
        <h3 style="margin-top:18px">商品资产</h3><div class="asset-grid">${(media.productImages || []).map((url) => `<img src="${url}" alt="商品参考图">`).join('')}</div>
        <div class="button-row"><button class="btn hot" data-action="analyze" ${state.busy ? 'disabled' : ''}>${state.busy ? '<i class="spinner"></i>正在拆解参考片…' : '开始自动分析'}</button></div>
      </section>
    </div>`;
}

function analysisBusy(project) {
  return `${projectHeader(project, 'Analyzing reference')}
    <div class="panel panel-dark"><p class="eyebrow" style="color:var(--cyan)">正在分析</p><h2>拆镜、语音与画面文字正在对齐</h2><p class="muted">这一步会处理原片媒体，不会提交付费视频生成。</p><div class="progress-track"><i></i></div></div>`;
}

function timeline(project) {
  const units = project.analysis?.generationUnits || [];
  const duration = project.analysis?.probe?.duration || 1;
  return `<div class="timeline-wrap"><div class="timeline-label"><span>0:00</span><span>${seconds(duration)}</span></div><div class="timeline">${units.map((unit) => `
    <div class="timeline-unit" style="width:${(unit.duration / duration) * 100}%" title="${seconds(unit.start)}–${seconds(unit.end)}"><b>${unit.id.replace('unit-', 'U')} · ${unit.duration.toFixed(1)}s</b></div>`).join('')}</div></div>`;
}

function confirmView(project) {
  const analysis = project.analysis;
  const editor = buildScriptEditorState(
    analysis.script,
    analysis.referenceTranscript || [],
    state.scriptDrafts
  );
  return `
    ${projectHeader(project, '03 / 生成前确认')}
    <section class="panel">
      <h3>${escapeHtml(analysis.summary)}</h3>
      <div class="stats-grid">
        <div class="stat"><strong>${analysis.shots.length}</strong><span>真实镜头</span></div>
        <div class="stat"><strong>${analysis.generationUnits.length}</strong><span>付费生成单元</span></div>
        <div class="stat"><strong>${analysis.script.length}</strong><span>新口播段落</span></div>
        <div class="stat"><strong>${analysis.probe.duration.toFixed(1)}s</strong><span>参考片时长</span></div>
      </div>
      ${timeline(project)}
      <div class="two-column">
        <div>
          <div class="script-compare-head"><h3>参考原台词</h3><h3>新商品台词</h3></div>
          <div class="script-list script-editor">${editor.rows.map((row) => `<div class="script-compare-row">
            <time>${seconds(row.start)}–${seconds(row.end)}</time>
            <p>${row.originalText ? escapeHtml(row.originalText) : '<span class="muted">未能取得参考台词</span>'}</p>
            <textarea data-script-line-id="${escapeHtml(row.id)}" aria-label="新商品台词 ${escapeHtml(row.id)}">${escapeHtml(row.draftText)}</textarea>
          </div>`).join('')}</div>
          <div class="button-row"><button class="btn light" data-action="save-script" ${!editor.dirty || state.busy ? 'disabled' : ''}>保存新台词</button>${editor.dirty ? '<small class="unsaved-note">有未保存的新台词，请先保存</small>' : '<small class="muted">新台词已保存</small>'}</div>
        </div>
        <aside class="card">
          <h3>本次生成约束</h3>
          <p class="muted">${project.presenterMode === 'generated' ? '人物由模型生成明确成年的带货人物' : '人物使用你的授权照片'}；参考片只提供动作、场景、构图、运镜和声音节奏。画面文字会在最后重绘。</p>
          <ul class="warning-list">${analysis.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
          <div class="button-row"><button class="btn hot" data-action="confirm-generate" ${state.busy || !editor.canConfirm ? 'disabled' : ''}>${state.busy ? '<i class="spinner"></i>正在建立任务…' : `确认方案并生成 ${analysis.generationUnits.length} 个片段`}</button></div>
          <small class="muted">${state.health.demoMode ? '点击后才会进入视频生成。演示模式不会产生 API 费用。' : `点击后才会进入视频生成。本次预计消耗 <strong>${estimateVideoCost(analysis.generationUnits)}</strong> 积分。`}</small>
        </aside>
      </div>
    </section>`;
}

function generatingView(project) {
  const jobs = project.jobs || [];
  const finished = jobs.filter((job) => ['ACCEPTED', 'REVIEW_REQUIRED', 'FAILED'].includes(job.status)).length;
  return `
    ${projectHeader(project, '04 / 多模态生成')}
    <div class="panel panel-dark" style="margin-bottom:18px"><p class="eyebrow" style="color:var(--cyan)">Seedance 2.0 pipeline</p><h2>${finished} / ${jobs.length} 个生成单元已返回</h2><p class="muted">任务 ID 已写入本地，关闭页面或重启服务都不会重复提交已有任务。</p><div class="progress-track"><i></i></div></div>
    <div class="job-grid">${jobs.map((job) => {
      const messages = job.displayIssues || [...new Set([...(job.issues || []), job.error].filter(Boolean))];
      return `<article class="card job-card ${job.status === 'FAILED' ? 'failed' : ''}"><div class="job-head"><strong>${job.unitId}</strong>${statusPill(job.status)}</div><span>第 ${job.attempt} 次生成 · ${escapeHtml(job.provider)}</span>${messages.length ? `<ul class="issue-list">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : '<div class="progress-track"><i></i></div>'}</article>`;
    }).join('')}</div>`;
}

function latestCandidate(project, unitId) {
  return (project.jobs || []).filter((job) => job.unitId === unitId).sort((a, b) => b.attempt - a.attempt)[0];
}

function reviewView(project) {
  const units = project.analysis?.generationUnits || [];
  const mediaUnits = project.media?.units || {};
  return `
    ${projectHeader(project, '05 / 问题片段审核')}
    <div class="section-head"><p class="lead">系统保留每次候选。请并排核验人物、商品、动作、运镜和声音节奏；接受后才能进入成片合成。</p>${project.status === 'READY_TO_RENDER' ? '<button class="btn hot" data-action="render-final">全部通过，合成 720p 成片</button>' : ''}</div>
    <div class="review-grid">${units.map((unit) => {
      const candidate = latestCandidate(project, unit.id);
      const messages = candidate?.displayIssues || [...new Set([...(candidate?.issues || []), candidate?.error].filter(Boolean))];
      const reference = mediaUnits[unit.id]?.referenceClip;
      const accepted = candidate?.accepted;
      return `<article class="card job-card ${accepted ? 'accepted' : candidate?.status === 'FAILED' ? 'failed' : ''}">
        <div class="job-head"><div><strong>${unit.id}</strong><span>${seconds(unit.start)}–${seconds(unit.end)}</span></div>${candidate ? statusPill(candidate.status) : ''}</div>
        <div class="compare ${project.ratio === '16:9' ? 'wide' : ''}">
          <figure>${reference ? `<video src="${reference}" controls preload="metadata"></video>` : '<div class="video-frame"></div>'}<figcaption>参考片段</figcaption></figure>
          <figure>${candidate?.outputUrl ? `<video src="${candidate.outputUrl}" controls preload="metadata"></video>` : '<div class="video-frame"></div>'}<figcaption>最新候选 · v${candidate?.attempt || 0}</figcaption></figure>
        </div>
        ${messages.length ? `<ul class="issue-list">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : ''}
        <div class="button-row">
          ${candidate?.outputUrl && !accepted ? `<button class="btn small hot" data-action="accept-job" data-id="${candidate.id}">接受这个版本</button>` : ''}
          ${candidate && candidate.retryable !== false ? `<button class="btn small light" data-action="regenerate-job" data-id="${candidate.id}">再次生成</button>` : ''}
        </div>
        ${candidate ? `<form class="replacement-form" data-job-id="${candidate.id}" style="margin-top:10px"><label class="file-field" style="min-height:64px"><input name="video" type="file" accept="video/mp4,video/quicktime,video/webm"><strong>上传替代片段</strong><span>上传后仍需点击接受</span></label></form>` : ''}
      </article>`;
    }).join('')}</div>`;
}

function completedView(project) {
  return `
    ${projectHeader(project, '06 / 最终交付')}
    <div class="final-stage">
      <video src="${project.media?.finalVideo || ''}" controls preload="metadata"></video>
      <aside class="panel">
        <p class="eyebrow">Delivery ready</p><h2>成片已经就位</h2><p class="muted">片段已按原时间线归一化、拼接，并重新渲染口播字幕和画面文字。</p>
        <div class="receipt">
          <div class="receipt-row"><span>输出画幅</span><strong>${project.ratio}</strong></div>
          <div class="receipt-row"><span>分辨率</span><strong>720p</strong></div>
          <div class="receipt-row"><span>片段数</span><strong>${project.analysis?.generationUnits.length || 0}</strong></div>
          <div class="receipt-row"><span>音频</span><strong>原生人声 + 音乐 + 音效</strong></div>
        </div>
        <div class="button-row"><a class="btn hot" href="${project.media?.finalVideo || '#'}" download>下载最终 MP4</a></div>
      </aside>
    </div>`;
}

function currentView() {
  if (state.view === 'home' || !state.current) return homeView();
  const project = state.current;
  if (project.status === 'DRAFT' || project.status === 'FAILED') return draftView(project);
  if (project.status === 'ANALYZING') return analysisBusy(project);
  if (project.status === 'READY_TO_CONFIRM') return confirmView(project);
  if (project.status === 'GENERATING' || project.status === 'RENDERING') return generatingView(project);
  if (project.status === 'NEEDS_REVIEW' || project.status === 'READY_TO_RENDER') return reviewView(project);
  if (project.status === 'COMPLETED') return completedView(project);
  return `<div class="empty-state"><strong>项目状态暂不可用</strong><span>${escapeHtml(project.status)}</span></div>`;
}

function render() {
  app.innerHTML = shell(currentView());
  updatePolling();
}

async function refreshProjects() {
  const body = await api('api/projects');
  state.projects = body.projects;
  if (state.current) state.current = state.projects.find((project) => project.id === state.current.id) || state.current;
}

async function openProject(id, rerender = true) {
  const body = await api(`api/projects/${id}`);
  if (state.current?.id !== id) state.scriptDrafts = {};
  state.current = body.project;
  state.view = 'project';
  if (rerender) render();
}

async function runAction(action, successMessage) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const body = await action();
    if (body?.project) state.current = body.project;
    await refreshProjects();
    if (successMessage) toast(successMessage);
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.busy = false;
    render();
  }
}

function updatePolling() {
  const shouldPoll = state.current && ['ANALYZING', 'GENERATING', 'RENDERING'].includes(state.current.status);
  if (shouldPoll && !state.pollTimer) {
    state.pollTimer = setInterval(async () => {
      try { await openProject(state.current.id, false); await refreshProjects(); render(); } catch { /* next tick retries */ }
    }, 3000);
  }
  if (!shouldPoll && state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function applyPresenterFormState(form, duration) {
  const requestedMode = form.querySelector('[name="presenterMode"]:checked')?.value || 'reference';
  const presenterState = presenterFormState(duration, requestedMode);
  const referenceRadio = form.querySelector('#presenter-reference');
  const generatedRadio = form.querySelector('#presenter-generated');
  const personInput = form.querySelector('[name="personPhotos"]');
  const personField = form.querySelector('#person-upload-field');
  const productField = form.querySelector('#product-upload-field');
  const guidance = form.querySelector('#presenter-guidance');

  referenceRadio.checked = presenterState.mode === 'reference';
  generatedRadio.checked = presenterState.mode === 'generated';
  generatedRadio.disabled = presenterState.forced;
  personInput.disabled = !presenterState.requiresPhotos;
  personInput.required = presenterState.requiresPhotos;
  personField.hidden = !presenterState.requiresPhotos;
  productField.classList.toggle('full', !presenterState.requiresPhotos);
  guidance.textContent = presenterState.message;
  guidance.classList.toggle('forced', presenterState.forced);
}

function videoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = () => URL.revokeObjectURL(url);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      finish();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error('无法读取参考视频时长'));
    };
    video.onerror = () => {
      finish();
      reject(new Error('无法读取参考视频时长'));
    };
    video.src = url;
  });
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'home') { state.view = 'home'; state.current = null; render(); }
  if (action === 'new-project') { state.view = 'home'; state.current = null; render(); setTimeout(() => document.querySelector('#name')?.focus(), 0); }
  if (action === 'open-project') await openProject(button.dataset.id).catch((error) => toast(error.message, true));
  if (action === 'analyze') await runAction(() => api(`api/projects/${state.current.id}/analyze`, { method: 'POST' }), '参考片分析完成');
  if (action === 'save-script') await runAction(async () => {
    const editor = buildScriptEditorState(
      state.current.analysis.script,
      state.current.analysis.referenceTranscript || [],
      state.scriptDrafts
    );
    const body = await api(`api/projects/${state.current.id}/script`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editor.payload)
    });
    state.scriptDrafts = {};
    return body;
  }, '新台词已保存');
  if (action === 'confirm-generate') {
    const editor = buildScriptEditorState(
      state.current.analysis.script,
      state.current.analysis.referenceTranscript || [],
      state.scriptDrafts
    );
    if (!editor.canConfirm) return toast('有未保存的新台词，请先保存', true);
    await runAction(async () => {
    await api(`api/projects/${state.current.id}/confirm`, { method: 'POST' });
    return api(`api/projects/${state.current.id}/generate`, { method: 'POST' });
    }, '生成任务已经建立');
  }
  if (action === 'accept-job') await runAction(() => api(`api/jobs/${button.dataset.id}/accept`, { method: 'POST' }), '已接受当前片段');
  if (action === 'regenerate-job') await runAction(() => api(`api/jobs/${button.dataset.id}/regenerate`, { method: 'POST' }), '已创建新的生成尝试');
  if (action === 'render-final') await runAction(() => api(`api/projects/${state.current.id}/render`, { method: 'POST' }), '最终成片已完成');
});

document.addEventListener('change', async (event) => {
  if (event.target.matches('input[type="file"]')) {
    const label = event.target.closest('.file-field');
    const count = event.target.files?.length || 0;
    label?.classList.toggle('has-file', count > 0);
    const detail = label?.querySelector('span');
    if (detail && count > 0) detail.textContent = count === 1 ? event.target.files[0].name : `已选择 ${count} 个文件`;
  }
  const form = event.target.closest('#create-project-form');
  if (!form) return;
  if (event.target.matches('[name="presenterMode"]')) {
    const duration = form.dataset.referenceDuration ? Number(form.dataset.referenceDuration) : undefined;
    applyPresenterFormState(form, duration);
  }
  if (event.target.matches('[name="referenceVideo"]')) {
    const file = event.target.files?.[0];
    if (!file) {
      delete form.dataset.referenceDuration;
      applyPresenterFormState(form, undefined);
      return;
    }
    try {
      const duration = await videoDuration(file);
      form.dataset.referenceDuration = String(duration);
      applyPresenterFormState(form, duration);
    } catch (error) {
      toast(error.message, true);
    }
  }
});

document.addEventListener('input', (event) => {
  const editor = event.target.closest('[data-script-line-id]');
  if (!editor) return;
  state.scriptDrafts[editor.dataset.scriptLineId] = editor.value;
  const editorState = buildScriptEditorState(
    state.current.analysis.script,
    state.current.analysis.referenceTranscript || [],
    state.scriptDrafts
  );
  const saveButton = document.querySelector('[data-action="save-script"]');
  const confirmButton = document.querySelector('[data-action="confirm-generate"]');
  if (saveButton) saveButton.disabled = !editorState.dirty;
  if (confirmButton) confirmButton.disabled = !editorState.canConfirm;
  const note = document.querySelector('.unsaved-note, .script-editor + .button-row small');
  if (note) {
    note.className = editorState.dirty ? 'unsaved-note' : 'muted';
    note.textContent = editorState.dirty ? '有未保存的新台词，请先保存' : '新台词已保存';
  }
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id === 'create-project-form') {
    const form = event.target;
    const presenterMode = form.querySelector('[name="presenterMode"]:checked').value;
    const personCount = form.querySelector('[name="personPhotos"]').files.length;
    if (presenterMode === 'reference' && (personCount < 1 || personCount > 5)) {
      return toast('指定模特模式请上传 1–5 张人物照片', true);
    }
    await runAction(async () => {
      const body = await api('api/projects', { method: 'POST', body: new FormData(form) });
      state.current = body.project;
      state.view = 'project';
      return body;
    }, '项目素材已经保存');
  }
  if (event.target.matches('.replacement-form')) {
    const file = event.target.querySelector('[name="video"]').files[0];
    if (!file) return toast('请先选择替代视频', true);
    await runAction(() => api(`api/jobs/${event.target.dataset.jobId}/replacement`, {
      method: 'POST', body: new FormData(event.target)
    }), '替代片段已上传');
  }
});

async function boot() {
  try {
    state.health = await api('api/health');
    await refreshProjects();
    render();
  } catch (error) {
    app.innerHTML = `<div class="boot-screen"><span class="brand-mark">!</span><h2>工作台没有启动</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

boot();
