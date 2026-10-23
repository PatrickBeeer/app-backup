import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type JobStatus = 'queued' | 'running' | 'done' | 'error';

interface AppStatePayload {
  taobao_state: boolean;
  venv_python: boolean;
  python: string;
}

interface RunPayload {
  client_product_url: string;
  industry: string;
  category_keyword: string;
  platform: string;
  brand_name: string;
  target_market: string;
  price_range: string;
  notes: string;
  competitor_1_url: string;
  competitor_2_url: string;
  competitor_3_url: string;
  browser_mode: 'chrome' | 'managed';
  cdp_url: string;
  headless: boolean;
  limit: number;
}

interface JobPayload {
  id: string;
  status: JobStatus;
  created_at: number;
  log: string;
  report_path?: string;
  case_dir?: string;
}

const defaultForm: RunPayload = {
  client_product_url: '',
  industry: '',
  category_keyword: '',
  platform: '淘宝',
  brand_name: '',
  target_market: '中国大陆',
  price_range: '',
  notes: '',
  competitor_1_url: '',
  competitor_2_url: '',
  competitor_3_url: '',
  browser_mode: 'chrome',
  cdp_url: 'http://127.0.0.1:9222',
  headless: false,
  limit: 3,
};

function buildApiUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), import.meta.env.BASE_URL).toString();
}

function buildOutputUrl(relativePath: string): string {
  return buildApiUrl(`api/output/${relativePath}`);
}

function markdownToHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return '';
      return `<p>${line}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
}

function progressWidth(status: string): string {
  return (
    {
      queued: '15%',
      running: '58%',
      done: '100%',
      error: '100%',
    }[status] || '0%'
  );
}

export default function App() {
  const [form, setForm] = useState<RunPayload>(defaultForm);
  const [runLabel, setRunLabel] = useState('开始抓取分析');
  const [isRunning, setIsRunning] = useState(false);
  const [stateText, setStateText] = useState('检测中');
  const [stateError, setStateError] = useState<string | null>(null);
  const [jobLabel, setJobLabel] = useState('等待任务');
  const [jobStatus, setJobStatus] = useState('');
  const [logText, setLogText] = useState('填写左侧表单后开始任务。');
  const [reportHtml, setReportHtml] = useState('抓取完成后，这里会显示 Markdown 报告草稿。');
  const [reportIsEmpty, setReportIsEmpty] = useState(true);
  const [reportHref, setReportHref] = useState('');
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    let active = true;

    async function detectState() {
      try {
        const res = await fetch(buildApiUrl('api/state'), {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as AppStatePayload;
        if (!active) {
          return;
        }
        setStateText(data.venv_python ? '项目虚拟环境已就绪' : '未检测到 .venv');
        setStateError(data.venv_python ? null : 'missing');
      } catch (error) {
        if (!active) {
          return;
        }
        setStateText('运行环境检测失败');
        setStateError(error instanceof Error ? error.message : 'unknown');
      }
    }

    void detectState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logText]);

  async function loadReport(reportPath: string) {
    const res = await fetch(buildApiUrl(`api/report/${reportPath}`), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`加载报告失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { content?: string };
    setReportHtml(markdownToHtml(data.content || ''));
    setReportIsEmpty(false);
    setReportHref(buildOutputUrl(reportPath));
  }

  async function pollJob(id: string) {
    const res = await fetch(buildApiUrl(`api/job/${id}`), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`获取任务状态失败: HTTP ${res.status}`);
    }

    const data = (await res.json()) as JobPayload;
    setJobLabel(`任务 ${id} · ${data.status}`);
    setLogText(data.log || '');
    setJobStatus(data.status);

    if (data.status === 'done') {
      setIsRunning(false);
      setRunLabel('开始抓取分析');
      if (data.report_path) {
        await loadReport(data.report_path);
      }
      return true;
    }

    if (data.status === 'error') {
      setIsRunning(false);
      setRunLabel('重新运行');
      return true;
    }

    return false;
  }

  useEffect(() => {
    if (!jobLabel.startsWith('任务 ') || !isRunning) {
      return;
    }

    const match = jobLabel.match(/^任务\s+([a-z0-9]+)(?:\s|$)/i);
    const jobId = match?.[1];
    if (!jobId) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const loop = async () => {
      try {
        const done = await pollJob(jobId);
        if (!done && !cancelled) {
          timer = window.setTimeout(loop, 1400);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setIsRunning(false);
        setRunLabel('重新运行');
        setJobStatus('error');
        setLogText((previous) => `${previous}\n轮询失败：${error instanceof Error ? error.message : 'unknown error'}\n`);
      }
    };

    timer = window.setTimeout(loop, 1400);
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isRunning, jobLabel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunning(true);
    setRunLabel('运行中');
    setReportIsEmpty(true);
    setReportHtml('任务运行中，完成后自动载入报告。');
    setReportHref('');
    setLogText('正在提交任务...\n');
    setJobStatus('queued');

    try {
      const res = await fetch(buildApiUrl('api/run'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { job_id: string };
      setJobLabel(`任务 ${data.job_id}`);
      await pollJob(data.job_id);
    } catch (error) {
      setIsRunning(false);
      setRunLabel('重新运行');
      setJobStatus('error');
      setLogText(`提交任务失败：${error instanceof Error ? error.message : 'unknown error'}\n`);
    }
  }

  function updateField<K extends keyof RunPayload>(key: K, value: RunPayload[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function resetForm() {
    setForm(defaultForm);
    setRunLabel('开始抓取分析');
    setIsRunning(false);
    setJobLabel('等待任务');
    setJobStatus('');
    setLogText('填写左侧表单后开始任务。');
    setReportHtml('抓取完成后，这里会显示 Markdown 报告草稿。');
    setReportIsEmpty(true);
    setReportHref('');
  }

  const meterStyle = useMemo(
    () => ({
      width: progressWidth(jobStatus),
      background:
        jobStatus === 'error'
          ? 'linear-gradient(90deg, #b44835, #f2a83b)'
          : 'linear-gradient(90deg, #13856f, #f2a83b)',
    }),
    [jobStatus]
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">淘</div>
          <div>
            <strong>详情页分析台</strong>
            <span>Taobao page planner</span>
          </div>
        </div>

        <nav className="steps">
          <a className="active" href="#task">1. 创建任务</a>
          <a href="#browser">2. 浏览器模式</a>
          <a href="#competitors">3. 竞品来源</a>
          <a href="#result">4. 报告结果</a>
        </nav>

        <div className="state-card">
          <span className="label">运行环境</span>
          <strong style={{ color: stateError ? '#b44835' : '#13856f' }}>{stateText}</strong>
          <p>推荐使用“连接我的 Chrome”，先在自己的浏览器里完成淘宝登录。</p>
          <code>https://www.aiunity.shop/app/detail-page-gatherer</code>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>淘宝主图与详情页竞品抓取</h1>
            <p>输入客户链接和品类关键词，抓取 Top 3 竞品并生成策划报告草稿。</p>
          </div>
          <button className="ghost" id="clearBtn" type="button" onClick={resetForm}>
            清空
          </button>
        </header>

        <section className="workspace">
          <form className="panel form-panel" id="taskForm" onSubmit={handleSubmit}>
            <div className="panel-head" id="task">
              <h2>任务信息</h2>
              <span>必填项越完整，报告越可用</span>
            </div>

            <label className="field wide">
              <span>客户产品链接</span>
              <input
                name="client_product_url"
                placeholder="https://item.taobao.com/item.htm?id=..."
                required
                value={form.client_product_url}
                onChange={(event) => updateField('client_product_url', event.target.value)}
              />
            </label>

            <div className="grid two">
              <label className="field">
                <span>行业 / 品类</span>
                <input
                  name="industry"
                  placeholder="例如：宠物用品"
                  required
                  value={form.industry}
                  onChange={(event) => updateField('industry', event.target.value)}
                />
              </label>
              <label className="field">
                <span>搜索关键词</span>
                <input
                  name="category_keyword"
                  placeholder="例如：猫窝"
                  required
                  value={form.category_keyword}
                  onChange={(event) => updateField('category_keyword', event.target.value)}
                />
              </label>
            </div>

            <div className="grid three">
              <label className="field">
                <span>品牌名</span>
                <input
                  name="brand_name"
                  placeholder="客户品牌"
                  value={form.brand_name}
                  onChange={(event) => updateField('brand_name', event.target.value)}
                />
              </label>
              <label className="field">
                <span>目标市场</span>
                <input
                  name="target_market"
                  value={form.target_market}
                  onChange={(event) => updateField('target_market', event.target.value)}
                />
              </label>
              <label className="field">
                <span>价格区间</span>
                <input
                  name="price_range"
                  placeholder="50-150 RMB"
                  value={form.price_range}
                  onChange={(event) => updateField('price_range', event.target.value)}
                />
              </label>
            </div>

            <div className="panel-head sub" id="browser">
              <h2>浏览器模式</h2>
              <span>淘宝建议使用自己的 Chrome，降低异常登录概率</span>
            </div>

            <div className="mode-group">
              <label className={`mode ${form.browser_mode === 'chrome' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="browser_mode"
                  value="chrome"
                  checked={form.browser_mode === 'chrome'}
                  onChange={() => updateField('browser_mode', 'chrome')}
                />
                <strong>连接我的 Chrome</strong>
                <span>使用你已登录的 Chrome 页面，推荐</span>
              </label>
              <label className={`mode ${form.browser_mode === 'managed' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="browser_mode"
                  value="managed"
                  checked={form.browser_mode === 'managed'}
                  onChange={() => updateField('browser_mode', 'managed')}
                />
                <strong>托管 Chromium</strong>
                <span>使用保存的登录态，适合测试</span>
              </label>
            </div>

            <label className="field wide">
              <span>Chrome 调试地址</span>
              <input
                name="cdp_url"
                value={form.cdp_url}
                onChange={(event) => updateField('cdp_url', event.target.value)}
              />
            </label>

            <div className="panel-head sub" id="competitors">
              <h2>竞品链接</h2>
              <span>可留空，系统会按关键词搜索 Top 3</span>
            </div>

            {(['competitor_1_url', 'competitor_2_url', 'competitor_3_url'] as const).map((key, index) => (
              <label className="field wide" key={key}>
                <span>{`竞品 ${index + 1}`}</span>
                <input
                  name={key}
                  placeholder="可选：手动指定竞品链接"
                  value={form[key]}
                  onChange={(event) => updateField(key, event.target.value)}
                />
              </label>
            ))}

            <label className="field wide">
              <span>备注</span>
              <textarea
                name="notes"
                rows={4}
                placeholder="例如：关注年轻女性用户、偏高端视觉、重点对比收纳和材质卖点"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
              />
            </label>

            <div className="actions">
              <label className="check">
                <input
                  type="checkbox"
                  name="headless"
                  checked={form.headless}
                  onChange={(event) => updateField('headless', event.target.checked)}
                />
                <span>托管 Chromium 后台运行</span>
              </label>
              <button className="primary" id="runBtn" type="submit" disabled={isRunning}>
                {runLabel}
              </button>
            </div>
          </form>

          <aside className="result-column" id="result">
            <section className="panel status-panel">
              <div className="panel-head">
                <h2>运行状态</h2>
                <span id="jobId">{jobLabel}</span>
              </div>
              <div className="meter">
                <div id="meterBar" style={meterStyle} />
              </div>
              <pre id="logBox" ref={logRef}>{logText}</pre>
            </section>

            <section className="panel report-panel">
              <div className="panel-head">
                <h2>报告预览</h2>
                {reportHref ? (
                  <a id="reportLink" href={reportHref} target="_blank" rel="noreferrer">
                    打开文件
                  </a>
                ) : null}
              </div>
              {reportIsEmpty ? (
                <article id="reportPreview" className="report-empty">
                  {reportHtml}
                </article>
              ) : (
                <article
                  id="reportPreview"
                  dangerouslySetInnerHTML={{ __html: reportHtml }}
                />
              )}
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
