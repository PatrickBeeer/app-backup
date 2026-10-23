// 商品裂变实验室 - 前端逻辑
// 页面结构：产品 → 人群 → 每个人群的场景 → 每个场景下的价格档位（低价 / 平价 / 高价）
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    image: null,        // data URL
    thumbnail: null,    // 历史记录使用的小图，避免 localStorage 被原图撑满
    result: null,       // 最近一次分析结果
    health: { demo: false },
  };

  const HISTORY_KEY = "fission_history_v1";
  const TIERS = ["低价", "平价", "高价"];

  // ---------- 工具 ----------
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function listHtml(arr) {
    if (!Array.isArray(arr) || !arr.length) return '<span class="muted">暂无</span>';
    return '<ul class="bullets">' + arr.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>";
  }
  function qualityText(level) {
    if (level === "risk") return "有风险";
    if (level === "warning") return "需优化";
    return "可用";
  }
  function qualityBadgeHtml(report) {
    const r = report || { score: 100, level: "good", issues: [] };
    return `<span class="quality-badge quality-${esc(r.level || "good")}">${qualityText(r.level)} ${esc(r.score || 100)} 分</span>`;
  }
  function qualityIssuesHtml(report) {
    const r = report || {};
    const issues = Array.isArray(r.issues) ? r.issues : [];
    if (!issues.length) {
      return '<div class="quality-empty">暂未发现明显文案或合规风险。</div>';
    }
    return `<div class="quality-list">${issues.map((it) => `
      <div class="quality-issue ${it.severity === "fail" ? "fail" : "warning"}">
        <div class="qi-head">
          <span>${it.severity === "fail" ? "高风险" : "提醒"}</span>
          <b>${esc(it.field || "copy")}</b>
        </div>
        <div class="qi-message">${esc(it.message || "")}</div>
        ${it.suggestion ? `<div class="qi-suggestion">${esc(it.suggestion)}</div>` : ""}
      </div>`).join("")}</div>`;
  }
  // ---------- 执行方案：通用卡片渲染 ----------
  function pad2(n) { return String(n).padStart(2, "0"); }
  // 只渲染有值的行；label 宽度由 CSS 统一控制
  function psLines(pairs) {
    return pairs
      .filter((p) => p[1])
      .map(([label, value]) => `<div class="ps-line"><b>${esc(label)}</b>${esc(value)}</div>`)
      .join("");
  }
  /** 一张卡片：head 常显，visible 常显，more 折叠在「展开」里 */
  function planCardHtml(head, visible, more) {
    return `
      <div class="plan-card">
        <div class="pc-head">${esc(head)}</div>
        <div class="pc-body">${visible || '<span class="muted">暂无</span>'}</div>
        ${more ? `<details class="pc-more"><summary>展开</summary><div class="pc-more-body">${more}</div></details>` : ""}
      </div>`;
  }
  /** 历史遗留数据结构（scene/detail/character/copy）的兼容渲染 */
  function legacyCardHtml(head, pairs) {
    return planCardHtml(head, psLines(pairs), "");
  }

  // 逐张主图：默认 页面任务 / 核心卖点 / 主标题 / 画面构思；展开 副标题 / 构图 / 视觉证明 / 适配原因
  function mainImagePlanHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<span class="muted">暂无</span>';
    return `<div class="plan-list">${items.map((item, idx) => {
      if (!item || typeof item !== "object") {
        return legacyCardHtml(`主图 ${pad2(idx + 1)}`, [["说明", item]]);
      }
      const no = pad2(item.index || idx + 1);
      const type = item.type || "";
      const head = `主图${no}${type ? "｜" + type : ""}`;
      // 旧结构：scene / detail / character / copy
      if (!item.task && !item.mainTitle && (item.scene || item.detail || item.character)) {
        return legacyCardHtml(head, [
          ["场景", item.scene], ["细节", item.detail],
          ["人物使用", item.character || item.person], ["主图文案", item.copy],
        ]);
      }
      return planCardHtml(
        head,
        psLines([
          ["页面任务", item.task], ["核心卖点", item.sellingPoint],
          ["主标题", item.mainTitle], ["画面构思", item.visualIdea],
        ]),
        psLines([
          ["副标题", item.subTitle], ["构图", item.composition],
          ["视觉证明", item.visualProof], ["适配原因", item.fitReason],
        ]),
      );
    }).join("")}</div>`;
  }

  // 详情页逐屏：默认 页面任务 / 核心主题 / 主标题 / 画面构思；
  // 展开 副标题 / 核心卖点 / 证明方式 / 用户收益 / 上下屏关系
  function detailPlanHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<span class="muted">暂无</span>';
    return `<div class="plan-list">${items.map((item, idx) => {
      if (!item || typeof item !== "object") {
        return legacyCardHtml(`第 ${pad2(idx + 1)} 屏`, [["主思路", item]]);
      }
      const no = pad2(item.index || idx + 1);
      const role = item.role || "";
      const head = `第${no}屏${role ? "｜" + role : ""}`;
      // 旧结构：screen / mainIdea / visualIdea / mainTitle / subTitle
      if (!item.role && !item.task && (item.screen || item.mainIdea)) {
        return legacyCardHtml(head, [
          ["主思路", item.mainIdea], ["构思画面", item.visualIdea],
          ["主标题", item.mainTitle], ["副标题", item.subTitle || item.copy],
        ]);
      }
      const rel = [
        item.prevRelation ? ["上一屏关系", item.prevRelation] : null,
        item.nextRelation ? ["下一屏关系", item.nextRelation] : null,
      ].filter(Boolean);
      return planCardHtml(
        head,
        psLines([
          ["页面任务", item.task], ["核心主题", item.theme],
          ["主标题", item.mainTitle], ["画面构思", item.visualIdea],
        ]),
        psLines([
          ["副标题", item.subTitle], ["核心卖点", item.sellingPoint],
          ["证明方式", item.proof], ["用户收益", item.benefit],
        ].concat(rel)),
      );
    }).join("")}</div>`;
  }

  // ---------- 执行方案：策略层渲染 ----------
  function chipsHtml(arr) {
    if (!Array.isArray(arr) || !arr.length) return '<span class="muted">暂无</span>';
    return `<div class="chip-row">${arr.map((x) => `<span class="chip-static">${esc(x)}</span>`).join("")}</div>`;
  }
  function copyStrategyHtml(cs) {
    if (!cs || typeof cs !== "object") return '<span class="muted">暂无</span>';
    return `
      <div class="dl"><span class="dk">文案语气</span><span class="dv">${esc(cs.tone || "—")}</span></div>
      <div class="dl"><span class="dk">建议关键词</span><span class="dv">${chipsHtml(cs.keywords)}</span></div>
      <div class="dl"><span class="dk">主标题风格</span><span class="dv">${esc(cs.mainTitleStyle || "—")}</span></div>
      <div class="dl"><span class="dk">副标题风格</span><span class="dv">${esc(cs.subTitleStyle || "—")}</span></div>
      <div class="dl"><span class="dk">避免表达</span><span class="dv">${chipsHtml(cs.avoid)}</span></div>`;
  }
  function visualStrategyHtml(vs) {
    if (!vs || typeof vs !== "object") return '<span class="muted">暂无</span>';
    return `
      <div class="dl"><span class="dk">风格关键词</span><span class="dv">${chipsHtml(vs.styleKeywords)}</span></div>
      <div class="dl"><span class="dk">场景</span><span class="dv">${esc(vs.scene || "—")}</span></div>
      <div class="dl"><span class="dk">人物</span><span class="dv">${esc(vs.character || "—")}</span></div>
      <div class="dl"><span class="dk">色彩</span><span class="dv">${esc(vs.color || "—")}</span></div>
      <div class="dl"><span class="dk">光线</span><span class="dv">${esc(vs.lighting || "—")}</span></div>
      <div class="dl"><span class="dk">构图</span><span class="dv">${esc(vs.composition || "—")}</span></div>
      <div class="dl"><span class="dk">道具</span><span class="dv">${chipsHtml(vs.props)}</span></div>
      <div class="dl"><span class="dk">包装露出</span><span class="dv">${esc(vs.packageDisplay || "—")}</span></div>`;
  }
  function pricePositioningHtml(pp) {
    if (!pp || typeof pp !== "object") return '<span class="muted">暂无</span>';
    return `
      <div class="dl"><span class="dk">档位定位</span><span class="dv">${esc(pp.positioning || "—")}</span></div>
      <div class="dl"><span class="dk">消费者期待</span><span class="dv">${esc(pp.expectation || "—")}</span></div>
      <div class="dl"><span class="dk">主图重点</span><span class="dv">${esc(pp.mainImageFocus || "—")}</span></div>
      <div class="dl"><span class="dk">详情页必须证明</span><span class="dv">${esc(pp.detailPageProof || "—")}</span></div>
      <div class="dl"><span class="dk">不适合表达</span><span class="dv">${esc(pp.avoid || "—")}</span></div>`;
  }
  // 卖点四层结构：功能 / 支撑点 / 证明 / 收益
  function matrixHtml(list) {
    if (!Array.isArray(list) || !list.length) return '<span class="muted">暂无</span>';
    return `<div class="plan-list">${list.map((m, idx) => {
      if (!m || typeof m !== "object") return legacyCardHtml(`卖点 ${pad2(idx + 1)}`, [["说明", m]]);
      return planCardHtml(
        `卖点${pad2(idx + 1)}｜${m.feature || "未命名卖点"}`,
        psLines([["功能", m.feature], ["收益", m.benefit]]),
        psLines([["支撑点", m.mechanism], ["证明", m.proof]]),
      );
    }).join("")}</div>`;
  }
  function imageRulesHtml(r) {
    if (!r || typeof r !== "object") return '<span class="muted">暂无</span>';
    return psLines([
      ["主图规则", r.mainImage], ["详情页规则", r.detailPage],
      ["人物规则", r.character], ["场景规则", r.scene],
      ["文案规则", r.copy], ["构图规则", r.composition], ["价格档位规则", r.priceBand],
    ]) || '<span class="muted">暂无</span>';
  }
  function videoIdeaHtml(value) {
    if (!value) return '<span class="muted">—</span>';
    if (Array.isArray(value)) {
      return `<div class="page-shot-list">${value.map((item, idx) => {
        if (item && typeof item === "object") {
          return `
            <div class="page-shot">
              <div class="ps-title">${esc(item.time || item.scene || `镜头 ${idx + 1}`)}</div>
              ${item.content ? `<div class="ps-line"><b>内容</b>${esc(item.content)}</div>` : ""}
              ${item.visual ? `<div class="ps-line"><b>画面</b>${esc(item.visual)}</div>` : ""}
              ${item.copy ? `<div class="ps-line"><b>字幕</b>${esc(item.copy)}</div>` : ""}
              ${item.reason ? `<div class="ps-line"><b>目的</b>${esc(item.reason)}</div>` : ""}
            </div>`;
        }
        return `
          <div class="page-shot">
            <div class="ps-title">镜头 ${idx + 1}</div>
            <div class="ps-line"><b>内容</b>${esc(item)}</div>
          </div>`;
      }).join("")}</div>`;
    }
    return `<div class="q-a video-copy">${esc(value)}</div>`;
  }

  // ---------- 视图切换 ----------
  function show(view) {
    $$(".view").forEach((v) => v.classList.add("hidden"));
    $("#view-" + view).classList.remove("hidden");
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    // 阅读区更宽：产品分析与方案执行都是长内容，右栏太窄会挤成一团
    const ws = $(".workspace");
    if (ws) ws.classList.toggle("wide", view === "home" || view === "fission");
    if (view === "history") renderHistory();
    window.scrollTo(0, 0);
  }

  // ---------- 启动检查 ----------
  async function checkHealth() {
    try {
      const j = await window.productFissionApi.health();
      state.health.demo = !!j.demo;
      if (j.demo) $("#demoBadge").classList.remove("hidden");
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 图片上传 ----------
  const imageInput = $("#imageInput");
  const uploadDrop = $("#uploadDrop");
  const imagePreview = $("#imagePreview");
  const previewWrap = $("#previewWrap");
  const uploader = $("#uploader");

  uploadDrop.addEventListener("click", () => imageInput.click());
  $("#reuploadBtn").addEventListener("click", () => imageInput.click());
  uploader.addEventListener("dragover", (e) => { e.preventDefault(); uploadDrop.classList.add("dragover"); });
  uploader.addEventListener("dragleave", () => uploadDrop.classList.remove("dragover"));
  uploader.addEventListener("drop", (e) => {
    e.preventDefault(); uploadDrop.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  imageInput.addEventListener("change", () => {
    if (imageInput.files && imageInput.files[0]) handleFile(imageInput.files[0]);
  });

  function handleFile(file) {
    if (!/image\/(png|jpeg)/.test(file.type)) { alert("仅支持 JPG / PNG"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      state.image = reader.result;
      state.thumbnail = await makeThumbnail(reader.result);
      imagePreview.src = reader.result;
      $("#previewName").textContent = file.name || "产品图片";
      previewWrap.classList.remove("hidden");
      uploadDrop.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  }

  function makeThumbnail(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 360;
          const scale = Math.min(1, maxSide / img.width, maxSide / img.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // ---------- 提交分析 ----------
  $("#startBtn").addEventListener("click", startFission);

  async function startFission() {
    if (!state.image) {
      $("#homeError").textContent = "请先上传产品图片。";
      $("#homeError").classList.remove("hidden");
      return;
    }
    $("#homeError").classList.add("hidden");

    // 图片是唯一输入：产品是什么、值多少钱、卖给谁，全部由 AI 从图片推断
    const payload = { image: state.image };
    $("#loading").classList.remove("hidden");
    $("#startBtn").disabled = true;

    // 加载进度提示
    const messages = ["AI 正在识别产品…", "正在拆出适合的人群与场景…", "正在给每个场景细分价格档位…"];
    const lsEls = $$("#loading .ls");
    let mi = 0;
    const tick = () => {
      $("#loadingText").textContent = messages[mi] || messages[messages.length - 1];
      lsEls.forEach((el, i) => {
        el.classList.toggle("active", i === mi);
        el.classList.toggle("done", i < mi);
      });
      if (mi < messages.length - 1) mi += 1;
    };
    tick();
    const timer = setInterval(tick, 15000);

    try {
      const data = await window.productFissionApi.analyze(payload);
      if (!data.ok) throw new Error(data.error || "分析失败");
      if (!data.result || !(data.result.audiences || []).length) {
        throw new Error("AI 返回的人群/场景为空，请重试一次。");
      }

      state.result = ensureTree(data.result);
      if (data.demo) {
        state.health.demo = true;
        $("#demoBadge").classList.remove("hidden");
      }
      renderAnalysis();
      renderFission();
      saveHistory(payload, data.result);
      // 产品分析页只负责分析，分析完自动切到方案执行页看人群/场景/档位
      show("fission");
    } catch (e) {
      $("#homeError").textContent = "分析失败：" + e.message;
      $("#homeError").classList.remove("hidden");
    } finally {
      clearInterval(timer);
      lsEls.forEach((el) => el.classList.remove("active", "done"));
      $("#loading").classList.add("hidden");
      $("#startBtn").disabled = false;
    }
  }

  // ---------- 区块标题 ----------
  function secTitle(n, t, sub) {
    return `<div class="section-title"><span class="step-num">${n}</span>${esc(t)}${sub ? `<span class="st-sub">${esc(sub)}</span>` : ""}</div>`;
  }
  function tierClass(t) {
    const v = TIERS.indexOf(t) > -1 ? t : "平价";
    return "tier-" + v;
  }
  function tierLabel(t) {
    return TIERS.indexOf(t) > -1 ? t : "平价";
  }
  // 价格不写死：只显示档位词
  function aiEstimatedPrice(pa) {
    return (pa && (pa.estimatedPrice || pa.suitablePriceRange)) || "—";
  }
  function offersOf() {
    return (state.result && state.result.offers) || [];
  }
  function offerOf(idx) {
    const list = offersOf();
    return list[idx] || null;
  }

  // 旧版（扁平 offers）历史记录 / 旧接口的兜底：把方案按「人群 → 场景」拼成三级结构
  const LEGACY_TIER_MAP = {
    引流款: "低价", 低端款: "低价", 入门款: "低价", 基础款: "低价",
    主销款: "平价", 中端款: "平价", 标准款: "平价",
    礼赠款: "高价", 高端款: "高价", 旗舰款: "高价",
  };
  function legacyTier(raw) {
    const s = String(raw || "").trim();
    if (TIERS.indexOf(s) > -1) return s;
    for (const k in LEGACY_TIER_MAP) if (s.indexOf(k) > -1) return LEGACY_TIER_MAP[k];
    return "平价";
  }
  function ensureTree(result) {
    if (!result) return result;
    const hasTree = (result.audiences || []).some((a) => ((a && a.scenarios) || []).length);
    if (hasTree) return result;
    const offers = result.offers || [];
    if (!offers.length) return result;

    const audMap = new Map();
    offers.forEach((o, i) => {
      const audName = o.targetAudience || o.audienceName || "未分组人群";
      const scnName = o.scenario || o.scenarioName || "未分组场景";
      if (!audMap.has(audName)) audMap.set(audName, new Map());
      const scnMap = audMap.get(audName);
      if (!scnMap.has(scnName)) scnMap.set(scnName, { name: scnName, priceTiers: [] });
      scnMap.get(scnName).priceTiers.push({
        tier: legacyTier(o.priceTier || o.recommendedPrice),
        positioning: o.positioning,
        painPoint: o.painPoint,
        purchaseMotivation: o.purchaseMotivation,
        sellingPoints: o.sellingPoints,
        valueForm: o.valueForm || (o.productBundle || []).join("、"),
        pricingReason: o.pricingReason,
        productBundle: o.productBundle,
        mainTitle: o.mainTitle,
        _offerIdx: i,
      });
    });

    const audiences = [];
    audMap.forEach((scnMap, audName) => {
      const scenarios = [];
      scnMap.forEach((s) => scenarios.push(s));
      audiences.push({ name: audName, scenarios });
    });
    result.audiences = audiences;
    return result;
  }

  // ---------- 产品 DNA ----------
  /** 文本里若出现档位词（低价 / 平价 / 高价），抽出来做成标签，避免页面上出现金额 */
  function tierOfText(v) {
    const s = String(v || "");
    for (const t of TIERS) if (s.indexOf(t) > -1) return t;
    return "";
  }
  /** 一行「标签 + 值」；文本较长时自动改成上下两行，避免左窄右挤 */
  function kvRow(label, value, opts) {
    const o = opts || {};
    const raw = value === undefined || value === null ? "" : String(value);
    const stack = o.stack || raw.length > 26;
    const val = raw ? (o.html || esc(raw)) : '<span class="muted">—</span>';
    return `<div class="kv${stack ? " stack" : ""}"><span class="k">${esc(label)}</span><span class="v">${val}</span></div>`;
  }
  function dnaHtml() {
    const pa = (state.result && state.result.productAnalysis) || {};
    const priceTag = (v) => {
      const raw = String(v || "").trim();
      if (!raw) return '<span class="muted">—</span>';
      const t = tierOfText(raw);
      return t
        ? `<span class="tier-badge ${tierClass(t)}" title="${esc(raw)}">${esc(t)}</span>`
        : esc(raw);
    };
    const pills = (arr) => (arr || []).length
      ? arr.map((x) => `<span class="pill">${esc(x)}</span>`).join("")
      : '<span class="muted">暂无</span>';
    const base = [
      ["产品用途", pa.purpose], ["产品材质", pa.material],
      ["产品风格", pa.style], ["核心功能", pa.coreFunction],
    ];
    return `
      <div class="dna-card">
        <div class="dna-top">
          <div class="dna-name">${esc(pa.name || "未命名产品")}</div>
          ${pa.category ? `<span class="tag">${esc(pa.category)}</span>` : ""}
          ${pa.style ? `<span class="tag">${esc(pa.style)}</span>` : ""}
          <span class="tag accent">AI 参考档位 · ${esc(tierOfText(pa.estimatedPrice) || "—")}</span>
        </div>
        <div class="dna-cols">
          <div class="dna-sec"><h5>基础信息</h5>
            ${base.map(([k, v]) => kvRow(k, v)).join("")}
          </div>
          <div class="dna-sec"><h5>价值</h5>
            ${kvRow("功能价值", pa.functionalValue)}
            ${kvRow("情绪价值", pa.emotionalValue)}
          </div>
          <div class="dna-sec"><h5>价格判断</h5>
            <div class="dna-price">
              <div class="dp-cell"><span class="k">AI 参考档位</span>${priceTag(pa.estimatedPrice)}</div>
              <div class="dp-cell"><span class="k">推测成本带</span>${priceTag(pa.estimatedCost)}</div>
            </div>
            ${kvRow("定价依据", pa.priceBasis)}
          </div>
          <div class="dna-sec">
            <h5>核心卖点</h5><div class="pill-row">${pills(pa.coreSellingPoints)}</div>
            <h5 class="dna-h5-2">解决的问题</h5><div class="pill-row">${pills(pa.problemsSolved)}</div>
          </div>
        </div>
      </div>`;
  }

  // ---------- 三级结构：人群 → 场景 → 价格档位 ----------
  /** 档位卡片只留最少的字：档位标签 + 一句定位，细节全部进抽屉里看 */
  function tierCardHtml(tier, idx) {
    const label = tierLabel(tier.tier);
    return `
      <div class="tier-card" data-idx="${idx}">
        <div class="tc-head">
          <span class="tier-badge ${tierClass(label)}">${esc(label)}</span>
          <b class="tc-position">${esc(tier.positioning || "未命名档位")}</b>
        </div>
        ${tier.valueForm ? `<div class="tc-line"><span class="tl">价值</span><span class="tv">${esc(tier.valueForm)}</span></div>` : ""}
        <button class="oc-btn primary tc-btn" data-act="detail" data-idx="${idx}">看执行方案</button>
      </div>`;
  }

  function scenarioHtml(s, full) {
    const tiers = s.priceTiers || [];
    return `
      <div class="scn-card">
        <div class="scn-head">
          <span class="scn-name">${esc(s.name || "未命名场景")}</span>
          <span class="scn-count">${tiers.length ? tiers.length + " 个档位" : "未细分档位"}</span>
        </div>
        ${s.description ? `<div class="scn-desc">${esc(s.description)}</div>` : ""}
        ${tiers.length
          ? `<div class="tier-list">${tiers.map((t) => tierCardHtml(t, t._offerIdx)).join("")}</div>`
          : '<div class="empty-inline">这个场景还没有细分出价格档位。</div>'}
      </div>`;
  }

  function audienceHtml(a, i, full) {
    const scenarios = a.scenarios || [];
    const tierCount = scenarios.reduce((n, s) => n + ((s.priceTiers || []).length), 0);
    const id = "aud-" + i;
    const head = `
      <span class="aud-idx">人群 ${i + 1}</span>
      <h4>${esc(a.name || "未命名人群")}</h4>
      <span class="aud-count">${scenarios.length} 个场景 · ${tierCount} 个档位</span>
      ${full ? '<span class="aud-caret" aria-hidden="true"></span>' : ""}`;
    // 只保留最能认出「这是谁」的三行，其余细节进执行方案抽屉
    const portrait = [a.ageRange, a.identity].filter(Boolean).join(" · ");
    const inner = `
      <div class="aud-body">
        ${portrait ? `<div class="au-line"><b>画像</b>${esc(portrait)}</div>` : ""}
        ${a.painPoint ? `<div class="au-line"><b>核心痛点</b>${esc(a.painPoint)}</div>` : ""}
        ${a.spendingPower ? `<div class="au-line"><b>消费能力</b>${esc(a.spendingPower)}</div>` : ""}
      </div>
      ${scenarios.length
        ? `<div class="scn-list">${scenarios.map((s) => scenarioHtml(s, full)).join("")}</div>`
        : '<div class="empty-inline">这个人群还没有拆出场景。</div>'}`;
    if (!full) {
      return `<div class="aud-block" id="${id}"><div class="aud-head">${head}</div>${inner}</div>`;
    }
    // 方案执行页：人群可折叠，默认只展开第一个，避免一屏塞满十几套方案
    return `<details class="aud-block collapsible" id="${id}"${i === 0 ? " open" : ""}>
      <summary class="aud-head">${head}</summary>
      <div class="aud-inner">${inner}</div>
    </details>`;
  }

  /** full = true 时渲染成「方案执行」页（人群可折叠）；false 为紧凑模式（兼容旧调用）。 */
  function treeHtml(full) {
    const audiences = (state.result && state.result.audiences) || [];
    if (!audiences.length) {
      return '<div class="empty">这次没有拆出人群与场景，请重试一次。</div>';
    }
    return `<div class="tree">${audiences.map((a, i) => audienceHtml(a, i, full)).join("")}</div>`;
  }

  // ---------- 产品分析（右侧）：本页只负责「分析」，人群/场景/档位在方案执行页 ----------
  function renderAnalysis() {
    if (!state.result) return;
    $("#analysisContent").innerHTML = dnaHtml() + `
      <div class="done-note">
        <div class="dn-text">
          <b>分析完成</b>
          <span>人群、场景和价格档位已生成，已自动切到「方案执行」页；点任意档位可看主图与详情页执行方案。</span>
        </div>
        <button class="btn-primary" data-act="goto-fission">前往方案执行</button>
      </div>`;
    const btn = $("[data-act=goto-fission]");
    if (btn) btn.addEventListener("click", () => show("fission"));
  }

  // ---------- 方案执行 ----------
  function renderFission() {
    if (!state.result) {
      $("#fissionContent").innerHTML = '<div class="empty">还没有裂变方案，请先在「产品分析」里完成一次分析。</div>';
      return;
    }
    const qr = state.result.qualityReport || {};
    const qText = qr.issueCount ? `平均 ${qr.score || 100} 分，${qr.issueCount} 个提醒` : "全部可直接查看";
    const pa = (state.result && state.result.productAnalysis) || {};
    const header = `
      <div class="product-header">
        ${state.image ? `<img src="${state.image}" alt="产品" />` : '<div class="ph-placeholder">◈</div>'}
        <div class="ph-info">
          <h3>${esc(pa.name || "未命名产品")}</h3>
          <div class="ph-meta">
            ${pa.category ? `<span class="tag">${esc(pa.category)}</span>` : ""}
            ${pa.style ? `<span class="tag">${esc(pa.style)}</span>` : ""}
            <span class="tag accent">${esc(qText)}</span>
          </div>
        </div>
      </div>`;
    const audiences = (state.result && state.result.audiences) || [];
    const nav = audiences.length > 1 ? `
      <div class="tree-nav">
        <span class="tn-label">快速定位</span>
        <div class="tn-items">
          ${audiences.map((a, i) => `<button class="tn-item" data-act="goto" data-target="aud-${i}">
            <b>人群 ${i + 1}</b><span>${esc(a.name || "未命名人群")}</span>
          </button>`).join("")}
        </div>
        <button class="tn-action" data-act="toggle-all" data-state="closed">展开全部</button>
      </div>` : "";
    $("#fissionContent").innerHTML = header + nav + treeHtml(true);
    bindTreeClicks($("#fissionContent"));
  }

  // 卡片点击 / 按钮（事件委托）
  function bindTreeClicks(root) {
    if (!root) return;

    // 「快速定位」：跳到某个人群（折叠状态自动展开）
    root.addEventListener("click", (e) => {
      const goto = e.target.closest("[data-act=goto]");
      if (!goto) return;
      const el = document.getElementById(goto.dataset.target);
      if (!el) return;
      if (el.tagName === "DETAILS") el.open = true;
      $$(".tn-item").forEach((x) => x.classList.toggle("active", x === goto));
      if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1400);
    });

    // 展开 / 收起全部人群
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act=toggle-all]");
      if (!btn) return;
      const list = $$("#fissionContent .aud-block.collapsible");
      const open = btn.dataset.state !== "open";
      list.forEach((el) => { el.open = open; });
      btn.dataset.state = open ? "open" : "closed";
      btn.textContent = open ? "收起全部" : "展开全部";
    });

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act=detail]");
      const card = e.target.closest(".tier-card");
      const idx = btn ? btn.dataset.idx : card ? card.dataset.idx : null;
      if (idx === null || idx === undefined) return;
      e.stopPropagation();
      openDrawer(+idx);
    });
  }

  // ---------- 抽屉 ----------
  const drawer = $("#drawer");
  const overlay = $("#drawerOverlay");

  function countOf(list) { return Array.isArray(list) ? list.length : 0; }
  function miCount(plan) { const n = countOf(plan.mainImageStructure); return n ? `共 ${n} 张，点卡片展开` : "逐张执行计划"; }
  function dpCount(plan) { const n = countOf(plan.detailPageStructure); return n ? `共 ${n} 屏，点卡片展开` : "逐屏说服逻辑"; }
  function planReadyOf(plan) {
    return countOf(plan.mainImageStructure) >= 4 && countOf(plan.detailPageStructure) >= 6;
  }
  function pendingHtml(text) {
    return `<div class="plan-pending"><span class="spinner"></span><span>${esc(text)}</span></div>`;
  }
  function planErrorHtml(msg) {
    return `<div class="plan-error">
      <div>${esc(msg || "生成失败")}</div>
      <button class="retry-btn" data-act="retry-plan">重新生成</button>
    </div>`;
  }

  /** 把新生成的执行方案写进抽屉对应区块，避免整页重绘（用户展开状态不丢）。 */
  function renderPlanSections(idx) {
    const o = offerOf(idx);
    if (!o) return;
    const plan = o.executionPlan || {};
    const vs = plan.visualStrategy || o.visualStrategy || {};
    const pp = plan.pricePositioning || o.pricePositioning || {};
    const mx = plan.sellingPointMatrix || o.sellingPointMatrix || [];
    const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
    set("#bodyVisual", visualStrategyHtml(vs));
    set("#bodyPrice", pricePositioningHtml(pp));
    set("#bodyMatrix", matrixHtml(mx));
    set("#bodyMain", mainImagePlanHtml(plan.mainImageStructure));
    set("#bodyDetail", detailPlanHtml(plan.detailPageStructure));
    set("#bodyRules", imageRulesHtml(plan.imageGenRules));
    set("#secMainCount", miCount(plan));
    set("#secDetailCount", dpCount(plan));
  }

  /** 执行方案按需生成：主分析只给人群/场景/档位，点开某个档位时才生成这一套页面结构。 */
  function ensureExecutionPlan(idx) {
    const o = offerOf(idx);
    if (!o) return;
    const plan = o.executionPlan || {};
    if (planReadyOf(plan)) { renderPlanSections(idx); return; }

    window.productFissionApi.executionPlan({
        productAnalysis: state.result.productAnalysis || {},
        offer: {
          offerName: o.offerName, positioning: o.positioning, targetAudience: o.targetAudience,
          scenario: o.scenario, painPoint: o.painPoint, purchaseMotivation: o.purchaseMotivation,
          sellingPoints: o.sellingPoints, recommendedPrice: o.recommendedPrice,
          pricingReason: o.pricingReason, productBundle: o.productBundle, valueForm: o.valueForm,
          mainTitle: o.mainTitle, subTitle: o.subTitle, mainImageCopy: o.mainImageCopy,
          mainImageDirection: o.mainImageDirection, priceTier: o.priceTier,
          purchaseReason: o.purchaseReason,
          copyStrategy: o.copyStrategy, visualStrategy: o.visualStrategy,
          pricePositioning: o.pricePositioning, sellingPointMatrix: o.sellingPointMatrix,
        },
    })
      .then((data) => {
        if (!data || !data.ok) throw new Error((data && data.error) || "生成失败");
        o.executionPlan = data.plan || {};
        renderPlanSections(idx);
        patchHistoryPlan(idx);
      })
      .catch((e) => {
        const msg = (e && e.message) || "执行方案生成失败，请重试";
        const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
        set("#bodyMain", planErrorHtml(msg));
        set("#bodyDetail", "");
        set("#bodyRules", "");
      });
  }

  /** 把生成的执行方案回写进历史记录，下次打开同一条历史不用重新生成。 */
  function patchHistoryPlan(idx) {
    try {
      const list = loadHistory();
      const o = offerOf(idx);
      if (!o) return;
      const target = list.find(
        (h) => h && h.result && Array.isArray(h.result.offers)
          && h.result.offers[idx]
          && h.result.offers[idx].offerName === o.offerName
          && h.result.offers[idx].positioning === o.positioning,
      );
      if (!target) return;
      target.result.offers[idx].executionPlan = o.executionPlan;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) { /* 配额满等情况忽略 */ }
  }

  /** 抽屉顶部的区块目录：长内容按小节跳转，避免一路往下滚 */
  const DRAWER_SECTIONS = [
    ["secSummary", "摘要"], ["secVisual", "视觉"], ["secPrice", "档位"],
    ["secMatrix", "卖点"], ["secBundle", "组合"], ["secTitle", "标题"],
    ["secMainImage", "主图"], ["secDetailPage", "详情页"],
    ["secRules", "生图规则"], ["secVideo", "短视频"], ["secWhy", "购买理由"], ["secQuality", "质检"],
  ];
  function drawerNavHtml() {
    return `<nav class="drawer-nav" id="drawerNav">
      ${DRAWER_SECTIONS.map(([id, t]) => `<button class="dn-item" data-act="to-sec" data-sec="${id}">${esc(t)}</button>`).join("")}
      <button class="dn-action" data-act="toggle-sections" data-state="closed">展开全部</button>
    </nav>`;
  }

  function openDrawer(idx) {
    const o = offerOf(idx);
    if (!o) return;
    const pr = o.purchaseReason || {};
    const plan = o.executionPlan || {};
    const vs = plan.visualStrategy || o.visualStrategy || {};
    const pp = plan.pricePositioning || o.pricePositioning || {};
    const mx = plan.sellingPointMatrix || o.sellingPointMatrix || [];
    const planReady = planReadyOf(plan);
    const tier = tierLabel(o.priceTier || o.recommendedPrice);
    const full = `${drawerNavHtml()}
      <section class="decision-summary">
        <div class="decision-price"><span>价格档位</span><strong class="${tierClass(tier)}">${esc(tier)}</strong></div>
        <div class="decision-copy"><span>一句话卖法</span><b>${esc(o.mainTitle || o.positioning || "待确认")}</b></div>
      </section>
      <details class="read-section" id="secSummary" open>
        <summary><span>执行摘要</span><small>先读这里</small></summary>
        <div class="read-section-body">
        <div class="dl"><span class="dk">档位定位</span><span class="dv">${esc(o.positioning || "—")}</span></div>
        <div class="dl"><span class="dk">目标人群</span><span class="dv">${esc(o.targetAudience || "—")}</span></div>
        <div class="dl"><span class="dk">使用场景</span><span class="dv">${esc(o.scenario || "—")}</span></div>
        <div class="dl"><span class="dk">价格档位</span><span class="dv">${esc(tier)}</span></div>
        <div class="dl"><span class="dk">价值构成</span><span class="dv">${esc(o.valueForm || "—")}</span></div>
        <div class="dl"><span class="dk">核心痛点</span><span class="dv">${esc(o.painPoint || "—")}</span></div>
        <div class="dl"><span class="dk">购买动机</span><span class="dv">${esc(o.purchaseMotivation || "—")}</span></div>
        <div class="summary-points"><h4>核心卖点</h4>${listHtml(o.sellingPoints)}</div>
        </div>
      </details>
      <details class="read-section" id="secVisual">
        <summary><span>视觉策略</span><small>人群 + 场景 + 档位</small></summary>
        <div class="read-section-body" id="bodyVisual">${visualStrategyHtml(vs)}</div>
      </details>
      <details class="read-section" id="secPrice">
        <summary><span>档位策略</span><small>${esc(tier)} 该怎么说</small></summary>
        <div class="read-section-body" id="bodyPrice">${pricePositioningHtml(pp)}</div>
      </details>
      <details class="read-section" id="secMatrix">
        <summary><span>卖点四层结构</span><small>功能 / 支撑点 / 证明 / 收益</small></summary>
        <div class="read-section-body" id="bodyMatrix">${matrixHtml(mx)}</div>
      </details>
      <details class="read-section" id="secBundle">
        <summary><span>档位与商品组合</span><small>怎么卖</small></summary>
        <div class="read-section-body">
          <div class="dl"><span class="dk">档位成立理由</span><span class="dv">${esc(o.pricingReason || "暂无")}</span></div>
          <div class="dl"><span class="dk">价值构成</span><span class="dv">${esc(o.valueForm || "暂无")}</span></div>
          <div class="dl"><span class="dk">组合建议</span><span class="dv">${listHtml(o.productBundle)}</span></div>
        </div>
      </details>
      <details class="read-section" id="secTitle">
        <summary><span>商品标题与主图总纲</span><small>怎么呈现</small></summary>
        <div class="read-section-body">
        <div class="dl"><span class="dk">主标题</span><span class="dv">${esc(o.mainTitle || "—")}</span></div>
        <div class="dl"><span class="dk">副标题</span><span class="dv">${esc(o.subTitle || "—")}</span></div>
        <div class="dl"><span class="dk">主图文案</span><span class="dv">${esc(o.mainImageCopy || "—")}</span></div>
        <div class="dl"><span class="dk">主图总纲</span><span class="dv">${esc(o.mainImageDirection || "—")}</span></div>
        </div>
      </details>
      <details class="read-section" id="secMainImage" open>
        <summary><span>主图结构</span><small id="secMainCount">${miCount(plan)}</small></summary>
        <div class="read-section-body" id="bodyMain">${
          planReady ? mainImagePlanHtml(plan.mainImageStructure) : pendingHtml("正在按这个人群、场景和档位生成主图结构…")
        }</div>
      </details>
      <details class="read-section" id="secDetailPage" open>
        <summary><span>详情页结构</span><small id="secDetailCount">${dpCount(plan)}</small></summary>
        <div class="read-section-body" id="bodyDetail">${
          planReady ? detailPlanHtml(plan.detailPageStructure) : pendingHtml("正在生成这个方案专属的详情页屏序…")
        }</div>
      </details>
      <details class="read-section" id="secRules">
        <summary><span>图片生成规则</span><small>可直接喂给图片模型</small></summary>
        <div class="read-section-body" id="bodyRules">${imageRulesHtml(plan.imageGenRules)}</div>
      </details>
      <details class="read-section" id="secVideo">
        <summary><span>短视频方向</span><small>镜头与脚本</small></summary>
        <div class="read-section-body">${videoIdeaHtml(o.videoIdea)}</div>
      </details>
      <details class="read-section" id="secWhy">
        <summary><span>购买理由验证</span><small>方案为什么成立</small></summary>
        <div class="read-section-body">
        <div class="q-block"><div class="q-q">谁会买？</div><div class="q-a">${esc(pr.who || "—")}</div></div>
        <div class="q-block"><div class="q-q">在什么情况下买？</div><div class="q-a">${esc(pr.when || "—")}</div></div>
        <div class="q-block"><div class="q-q">为什么会买？</div><div class="q-a">${esc(pr.why || "—")}</div></div>
        <div class="q-block"><div class="q-q">为什么愿意在这个档位买单？</div><div class="q-a">${esc(pr.whyPrice || "—")}</div></div>
        </div>
      </details>
      <details class="read-section" id="secQuality">
        <summary><span>文案质量检查</span><small>${qualityBadgeHtml(o.qualityReport)}</small></summary>
        <div class="read-section-body">${qualityIssuesHtml(o.qualityReport)}</div>
      </details>`;
    drawer.innerHTML = `
      <div class="drawer-head">
        <div>
          <h3>${esc(o.offerName || "方案详情")}<span class="drawer-title-sub">${esc(o.positioning || "")}</span></h3>
          <span class="oc-tier ${tierClass(tier)}">${esc(tier)}</span>
        </div>
        <button class="drawer-close" id="drawerClose">×</button>
      </div>
      <div class="drawer-body">
        <div id="drawerContent">${full}</div>
      </div>`;

    drawer.dataset.idx = String(idx);
    drawer.classList.remove("hidden");
    overlay.classList.remove("hidden");

    $("#drawerClose").addEventListener("click", closeDrawer);
    // 主图与详情页结构较重，点开档位时才生成；已生成过的直接复用。
    ensureExecutionPlan(idx);
  }

  // 执行区块里的「重新生成」按钮
  drawer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act=retry-plan]");
    if (!btn) return;
    const idx = +drawer.dataset.idx;
    const o = offerOf(idx);
    if (!o) return;
    o.executionPlan = null;
    const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
    set("#bodyMain", pendingHtml("正在重新生成主图结构…"));
    set("#bodyDetail", pendingHtml("正在重新生成详情页屏序…"));
    ensureExecutionPlan(idx);
  });

  // 目录跳转：点到哪个区块就展开并滚过去
  drawer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act=to-sec]");
    if (!btn) return;
    const el = document.getElementById(btn.dataset.sec);
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    $$(".dn-item").forEach((x) => x.classList.toggle("active", x === btn));
    if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // 展开 / 收起全部区块
  drawer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act=toggle-sections]");
    if (!btn) return;
    const list = $$("#drawer .read-section");
    const open = btn.dataset.state !== "open";
    list.forEach((d) => { d.open = open; });
    btn.dataset.state = open ? "open" : "closed";
    btn.textContent = open ? "收起全部" : "展开全部";
  });

  function closeDrawer() {
    drawer.classList.add("hidden");
    overlay.classList.add("hidden");
  }
  overlay.addEventListener("click", closeDrawer);

  // ---------- 历史 ----------
  function saveHistory(payload, result) {
    try {
      const audiences = result.audiences || [];
      const item = {
        id: Date.now(),
        time: new Date().toLocaleString("zh-CN"),
        name: (result.productAnalysis && result.productAnalysis.name) || "未命名产品",
        audienceCount: audiences.length,
        price: aiEstimatedPrice(result.productAnalysis),
        offersCount: (result.offers || []).length,
        thumbnail: state.thumbnail,
        payload: { ...payload, image: null },
        result,
      };
      // 旧版本把原图存进每条历史，容易超过 localStorage 配额。读出时顺手瘦身。
      const list = loadHistory().map((h) => ({
        ...h,
        thumbnail: h.thumbnail || null,
        payload: { ...(h.payload || {}), image: null },
      }));
      list.unshift(item);
      const trimmed = list.slice(0, 30);
      while (trimmed.length) {
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
          return;
        } catch (e) {
          if (trimmed.length === 1 && trimmed[0].thumbnail) {
            trimmed[0].thumbnail = null;
          } else {
            trimmed.pop();
          }
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function renderHistory() {
    const list = loadHistory();
    if (!list.length) {
      $("#historyList").innerHTML = '<div class="empty">还没有记录。完成一次商品裂变后会出现在这里。</div>';
      return;
    }
    $("#historyList").innerHTML = list.map((h) => `
      <div class="history-card" data-id="${h.id}">
        <div class="hc-name">${esc(h.name)}</div>
        <div class="hc-meta">${h.audienceCount || 0} 类人群 · ${h.offersCount || 0} 个档位方案 · AI 参考售价 ${esc(h.price || "—")}</div>
        <div class="hc-meta">${esc(h.time)}</div>
      </div>`).join("");
    $("#historyList").querySelectorAll(".history-card").forEach((c) => {
      c.addEventListener("click", () => {
        const item = loadHistory().find((x) => String(x.id) === c.dataset.id);
        if (!item) return;
        if (restoreHistoryItem(item)) show("home");
      });
    });
  }

  function restoreHistoryItem(item) {
    if (!item || !item.result) return false;
    const p = item.payload || {};
    state.image = p.image || item.thumbnail || null;
    state.thumbnail = item.thumbnail || null;
    state.result = ensureTree(item.result);

    if (state.image) {
      imagePreview.src = state.image;
      $("#previewName").textContent =
        (item.result.productAnalysis && item.result.productAnalysis.name) || "产品图片";
      previewWrap.classList.remove("hidden");
      uploadDrop.classList.add("hidden");
    } else {
      previewWrap.classList.add("hidden");
      uploadDrop.classList.remove("hidden");
    }

    renderAnalysis();
    renderFission();
    return true;
  }

  function restoreLatestResult() {
    const latest = loadHistory().find(
      (item) => item && item.result && ((item.result.audiences || []).length || (item.result.offers || []).length),
    );
    return latest ? restoreHistoryItem(latest) : false;
  }

  // ---------- 导航 ----------
  $$(".nav-item").forEach((n) => n.addEventListener("click", () => show(n.dataset.view)));

  // ---------- init ----------
  checkHealth();
  restoreLatestResult();
  show("home"); // 同步阅读区宽版布局（宽屏下产品分析/方案执行都需要更宽的阅读区）
})();
