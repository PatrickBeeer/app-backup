const form = document.querySelector("#taskForm");
const runBtn = document.querySelector("#runBtn");
const clearBtn = document.querySelector("#clearBtn");
const logBox = document.querySelector("#logBox");
const jobId = document.querySelector("#jobId");
const meterBar = document.querySelector("#meterBar");
const reportPreview = document.querySelector("#reportPreview");
const reportLink = document.querySelector("#reportLink");
const stateText = document.querySelector("#stateText");
const modeCards = [...document.querySelectorAll(".mode")];

let pollTimer = null;

async function detectState() {
  const res = await fetch("/api/state");
  const data = await res.json();
  stateText.textContent = data.venv_python ? "项目虚拟环境已就绪" : "未检测到 .venv";
  stateText.style.color = data.venv_python ? "#13856f" : "#b44835";
}

function formToPayload() {
  const data = new FormData(form);
  const payload = {};
  for (const [key, value] of data.entries()) {
    payload[key] = typeof value === "string" ? value.trim() : value;
  }
  payload.platform = "淘宝";
  payload.limit = 3;
  payload.headless = data.has("headless");
  return payload;
}

function setProgress(status) {
  const width = {
    queued: "15%",
    running: "58%",
    done: "100%",
    error: "100%",
  }[status] || "0%";
  meterBar.style.width = width;
  meterBar.style.background =
    status === "error"
      ? "linear-gradient(90deg, #b44835, #f2a83b)"
      : "linear-gradient(90deg, #13856f, #f2a83b)";
}

function markdownToHtml(markdown) {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return "";
      return `<p>${line}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
}

async function loadReport(reportPath) {
  const res = await fetch(`/api/report/${reportPath}`);
  const data = await res.json();
  reportPreview.classList.remove("report-empty");
  reportPreview.innerHTML = markdownToHtml(data.content || "");
  reportLink.hidden = false;
  reportLink.href = `/${reportPath}`;
}

async function pollJob(id) {
  const res = await fetch(`/api/job/${id}`);
  const data = await res.json();

  jobId.textContent = `任务 ${id} · ${data.status}`;
  logBox.textContent = data.log || "";
  logBox.scrollTop = logBox.scrollHeight;
  setProgress(data.status);

  if (data.status === "done") {
    clearInterval(pollTimer);
    runBtn.disabled = false;
    runBtn.textContent = "开始抓取分析";
    await loadReport(data.report_path);
  }

  if (data.status === "error") {
    clearInterval(pollTimer);
    runBtn.disabled = false;
    runBtn.textContent = "重新运行";
  }
}

modeCards.forEach((card) => {
  card.addEventListener("click", () => {
    modeCards.forEach((item) => item.classList.remove("active"));
    card.classList.add("active");
    card.querySelector("input").checked = true;
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  runBtn.disabled = true;
  runBtn.textContent = "运行中";
  reportLink.hidden = true;
  reportPreview.className = "report-empty";
  reportPreview.textContent = "任务运行中，完成后自动载入报告。";
  logBox.textContent = "正在提交任务...\n";
  setProgress("queued");

  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(formToPayload()),
  });
  const data = await res.json();
  jobId.textContent = `任务 ${data.job_id}`;
  pollTimer = setInterval(() => pollJob(data.job_id), 1400);
  await pollJob(data.job_id);
});

clearBtn.addEventListener("click", () => {
  form.reset();
  form.elements.target_market.value = "中国大陆";
  form.elements.browser_mode.value = "chrome";
  modeCards.forEach((item) => item.classList.toggle("active", item.querySelector("input").value === "chrome"));
  logBox.textContent = "填写左侧表单后开始任务。";
  reportPreview.className = "report-empty";
  reportPreview.textContent = "抓取完成后，这里会显示 Markdown 报告草稿。";
  reportLink.hidden = true;
  jobId.textContent = "等待任务";
  setProgress("");
});

detectState();
