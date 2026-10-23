import React, { FormEvent, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Metric } from './components/Metric';
import { StatusRail } from './components/StatusRail';
import { validateXhsUrl } from './services/urlValidation';
import { deleteAnalysis, deleteGeneration, getAnalysis, getGeneration, latestCreation, listAnalyses, listGenerationsByAnalysis } from './services/historyStore';
import { analyzeFlow, generateFlow, generateTitlesFlow } from './services/orchestration';
import type { Analysis, CreationVersion, Generation, Insight, Report, Session } from './types';
import './index.css';

type Section = 'new' | 'insights' | 'reuse' | 'history';

const insightLabels: [keyof Pick<Report, 'viral_reasons' | 'user_pains' | 'content_structure' | 'title_formula' | 'cover_visual'>, string][] = [
  ['viral_reasons', '为什么这篇笔记能出圈'],
  ['user_pains', '用户真正的痛点'],
  ['content_structure', '内容结构拆解'],
  ['title_formula', '标题公式'],
  ['cover_visual', '首图视觉分析'],
];

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function Sidebar({ section, setSection, item, count }: { section: Section; setSection: (value: Section) => void; item?: Analysis; count: number }) {
  const nav = (key: Section, index: string, label: string, description: string, badge?: number) => (
    <button className={section === key ? 'active' : ''} onClick={() => setSection(key)} aria-current={section === key ? 'page' : undefined}>
      <span>{index}</span>
      <div><strong>{label}</strong><small>{description}</small></div>
      {badge !== undefined && <b>{badge}</b>}
    </button>
  );
  return (
    <aside className="app-sidebar">
      <header><div className="brand-mark">爆</div><div><strong>爆款拆解室</strong><small>XHS INTELLIGENCE</small></div></header>
      <nav aria-label="主功能导航">
        <div className="nav-group"><p>分析</p>{nav('new', '01', '新建分析', '输入笔记链接')}{nav('insights', '02', '爆款洞察', '结构 · 痛点 · 评论')}</div>
        <div className="nav-group"><p>创作</p>{nav('reuse', '03', '内容复刻', '标题 · 正文 · 封面')}</div>
        <div className="nav-group"><p>资料</p>{nav('history', '04', '历史记录', '查看与管理报告', count)}</div>
      </nav>
      <footer>{item ? <><span className={`current-dot ${item.status}`} /><div><small>当前笔记</small><strong>{item.note?.title || '正在获取笔记…'}</strong></div></> : <p>尚未选择笔记</p>}</footer>
    </aside>
  );
}

function InsightCard({ index, title, data }: { index: number; title: string; data: Insight }) {
  return <article className="insight"><span>{String(index).padStart(2, '0')}</span><h3>{title}</h3><div><p>{data.summary}</p>{data.evidence.length > 0 && <ul>{data.evidence.map((value, i) => <li key={i}>{value}</li>)}</ul>}</div></article>;
}

function Processing({ item, onRetry, retrying }: { item: Analysis; onRetry: () => void; retrying: boolean }) {
  return (
    <section className="processing-panel">
      <div className="page-kicker">LIVE ANALYSIS</div>
      <h2>{item.status === 'failed' ? '这次分析没有完成' : '正在读取与拆解笔记'}</h2>
      <StatusRail status={item.status} stage={item.stage} />
      {item.error && <div className="error-box"><p>{item.error}</p><button onClick={onRetry} disabled={retrying}>{retrying ? '正在重新分析…' : '重新分析'}</button></div>}
    </section>
  );
}

function EmptyFeature({ type, setSection }: { type: 'insights' | 'reuse'; setSection: (value: Section) => void }) {
  return (
    <section className="feature-empty">
      <span>{type === 'insights' ? '02' : '03'}</span>
      <div>
        <div className="page-kicker">NO ACTIVE NOTE</div>
        <h2>先选择一篇笔记</h2>
        <p>{type === 'insights' ? '完成分析后，这里会展示爆款原因、用户痛点与评论区需求。' : '选择一份已完成的报告，即可直接复刻标题、正文、封面与视频脚本。'}</p>
        <button onClick={() => setSection('new')}>新建分析</button>
        <button className="secondary" onClick={() => setSection('history')}>从历史记录选择</button>
      </div>
    </section>
  );
}

function NoteSelector({ records, value, onChange, label }: { records: Analysis[]; value: string; onChange: (id: string) => void; label: string }) {
  const completed = records.filter((record) => record.status === 'completed' && record.note);
  return (
    <div className="note-selector">
      <label>{label}</label>
      <div>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled>选择已分析的历史爆款</option>
          {completed.map((record) => <option key={record.id} value={record.id}>{record.note?.title || '未命名笔记'}</option>)}
        </select>
        <span>{completed.length} 篇可选</span>
      </div>
    </div>
  );
}

function CreationWorkbench({ versions, activeId, onOpen, onRemove, removing }: { versions: CreationVersion[]; activeId: string; onOpen: (version: CreationVersion) => void; onRemove: (version: CreationVersion) => void; removing: boolean }) {
  return (
    <aside className="creation-workbench">
      <header><div><div className="page-kicker">RECREATION ARCHIVE</div><h3>复刻小工作台</h3></div><b>{versions.length} 个版本</b></header>
      {versions.length ? (
        <div className="creation-versions">
          {versions.map((version, index) => (
            <article className={version.id === activeId ? 'active' : ''} key={version.id}>
              <button className="version-open" onClick={() => onOpen(version)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{version.selected_title || '未命名复刻'}</strong><small>{new Date(version.created_at).toLocaleString('zh-CN')} · {version.status === 'completed' ? '已完成' : version.status === 'failed' ? '失败' : '生成中'}</small></div>
              </button>
              <button className="version-delete" aria-label={`删除复刻：${version.selected_title}`} disabled={removing || !['completed', 'failed'].includes(version.status)} onClick={() => onRemove(version)}>删除</button>
            </article>
          ))}
        </div>
      ) : <div className="creation-empty">还没有生成好的复刻内容。完成一次生成后，会自动保存在这里。</div>}
    </aside>
  );
}

function Report({ item }: { item: Analysis }) {
  const note = item.note!;
  const report = item.report!;
  const cover = item.source_cover_data_url || note.media.cover_url || note.media.images?.[0];
  return (
    <>
      <header className="page-head"><div><div className="page-kicker">VIRAL REPORT / {Math.round(report.confidence * 100)}% CONFIDENCE</div><h2>爆款洞察</h2></div><p>所有判断均来自笔记内容、互动指标与公开评论样本。</p></header>
      <section className="report-shell">
        <aside className="source-note">
          {cover && <img src={cover} alt="原笔记首图" />}
          <div className="author"><span>{note.author.name || '小红书作者'}</span><small>{note.type === 'video' ? '视频笔记' : '图文笔记'}</small></div>
          <h3>{note.title || '未命名笔记'}</h3>
          <p>{note.content}</p>
          <div className="metrics"><Metric label="点赞" value={note.metrics.likes} /><Metric label="收藏" value={note.metrics.collects} /><Metric label="评论" value={note.metrics.comments} /></div>
        </aside>
        <section className="insights">
          <header className="report-title"><h2>这篇笔记为什么有效</h2></header>
          {insightLabels.map(([key, label], index) => <InsightCard key={key} index={index + 1} title={label} data={report[key]} />)}
          <article className="insight demands"><span>06</span><h3>评论区需求</h3><div className="demand-grid">{report.comment_demands.map((demand, index) => <div className="demand" key={index}><b>{demand.need}</b><em>样本频次 {demand.frequency}</em><p>{demand.examples.join(' / ')}</p></div>)}</div></article>
          {report.limitations.length > 0 && <p className="limitations">数据局限：{report.limitations.join('；')}</p>}
        </section>
      </section>
    </>
  );
}

function GeneratedResult({ data, onRetry, retrying, sourceIsVideo }: { data: Generation; onRetry: () => void; retrying: boolean; sourceIsVideo: boolean }) {
  if (data.status === 'failed') {
    const message = /timed?\s*out|timeout/i.test(data.error || '') ? 'AI 服务响应超时，本次没有生成正文。可以保留当前标题直接重试。' : data.error || '生成服务暂时没有返回结果，请重新生成。';
    return <section className="generation-failed" role="alert"><div className="page-kicker">CONTENT / FAILED</div><h3>内容生成没有完成</h3><p>{message}</p><button onClick={onRetry} disabled={retrying}>{retrying ? '正在重新生成…' : '重新生成正文与封面 →'}</button><small>已选标题会保留，无需重新选择。</small></section>;
  }
  if (data.status !== 'completed') return <StatusRail status={data.status} stage={data.stage} mode="generation" video={sourceIsVideo} />;
  const isVideo = sourceIsVideo && Boolean(data.video_script?.shots?.length);
  const coverError = data.compliance?.cover_error;
  return (
    <section className="result-studio" aria-live="polite">
      <header className="result-head"><div><div className="page-kicker">CONTENT PACKAGE / READY</div><h2>{data.selected_title}</h2></div><div className="result-actions"><span>{isVideo ? '视频复刻包 · 3项资产' : '图文复刻包 · 2项资产'}</span><button onClick={onRetry} disabled={retrying}>{retrying ? '正在重新生成…' : '重新生成 ↻'}</button></div></header>
      <div className="result-map"><b>交付内容</b><span>01 可直接发布正文</span><span>02 自适应复刻封面</span>{isVideo && <span>03 视频脚本分镜</span>}</div>
      <div className="result-layout">
        <article className="result-card copy-card">
          <header><span>01</span><div><small>READY TO POST</small><h3>可直接发布正文</h3></div><button className="copy" onClick={() => navigator.clipboard.writeText(data.body || '')}>复制去发布</button></header>
          <pre>{data.body}</pre>
          {data.compliance && !data.compliance.passed && <p className="warning">发布前请人工复核：{data.compliance.issues.map((value) => value.term).join('、')}</p>}
        </article>
        <article className="result-card cover-card">
          <header><span>02</span><div><small>ADAPTIVE COVER / 3:4</small><h3>爆款封面复刻</h3></div></header>
          {data.cover_url ? (
            <>
              <img src={data.cover_url} alt={`结合原爆款和新标题生成的封面：${data.selected_title}`} />
              <p className="cover-note">根据原爆款自动选择文字排版或主题画面，并结合新标题重新设计。</p>
              <button className="cover-download" onClick={() => downloadDataUrl(data.cover_url!, `小红书封面-${data.id.slice(0, 8)}.png`)}>下载 PNG 封面 ↓</button>
            </>
          ) : (
            <div className="cover-missing"><b>封面暂未生成</b><p>{coverError || '封面排版暂时没有完成，正文已安全保留。'}</p><button onClick={onRetry} disabled={retrying}>重新生成整套内容</button></div>
          )}
        </article>
        {isVideo && (
          <article className="result-card storyboard-card">
            <header><span>03</span><div><small>VIDEO STORYBOARD</small><h3>视频脚本分镜</h3></div><button className="copy" onClick={() => navigator.clipboard.writeText(data.video_script!.shots.map((shot, i) => `${i + 1}. ${shot.duration}\n画面：${shot.visual}\n口播：${shot.narration}\n字幕：${shot.subtitle}`).join('\n\n'))}>复制分镜</button></header>
            <div className="shot-list">{data.video_script!.shots.map((shot, i) => <section key={i}><b>{String(i + 1).padStart(2, '0')}</b><time>{shot.duration}</time><div><strong>画面</strong><p>{shot.visual}</p></div><div><strong>口播 / 字幕</strong><p>{shot.narration}</p>{shot.subtitle && <small>{shot.subtitle}</small>}</div></section>)}</div>
          </article>
        )}
      </div>
    </section>
  );
}

interface ActionState {
  mutate: () => void;
  isPending: boolean;
  error: Error | null;
}

function Reuse({ item, records, openSource, brief, setBrief, titleData, selected, chooseTitle, titles, generate, generation, versions, openVersion, removeVersion, removingVersion }: {
  item: Analysis;
  records: Analysis[];
  openSource: (id: string) => void;
  brief: string;
  setBrief: (value: string) => void;
  titleData: { session_id: string; titles: string[] } | null;
  selected: string;
  chooseTitle: (title: string) => void;
  titles: ActionState;
  generate: ActionState;
  generation?: Generation;
  versions: CreationVersion[];
  openVersion: (version: CreationVersion) => void;
  removeVersion: (version: CreationVersion) => void;
  removingVersion: boolean;
}) {
  const isVideo = item.note?.type === 'video';
  const generationBusy = generate.isPending || Boolean(generation && !['completed', 'failed'].includes(generation.status));
  return (
    <>
      <header className="page-head reuse-head">
        <div><div className="page-kicker">RECREATE / ORIGINAL EXPRESSION</div><h2>内容复刻</h2></div>
        <p>选择一篇历史爆款作为方法参考，再生成独立原创内容。</p>
      </header>
      <div className="reuse-workspace">
        <section className="reuse">
          <NoteSelector records={records} value={item.id} onChange={openSource} label="选择要复刻的历史爆款" />
          <label className="optional-label" htmlFor="reuse-brief">自定义要求 <span>选填</span></label>
          <textarea id="reuse-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="可留空直接生成；也可以写：面向职场新人，语气像真实经验分享，正文更简短……" />
          <button onClick={() => titles.mutate()} disabled={titles.isPending}>{titles.isPending ? '正在复刻…' : brief.trim() ? '按要求生成 3 个标题' : '直接生成复刻标题'}</button>
          {titles.error && <p className="error">{titles.error.message}</p>}
          {titleData && <div className="title-options">{titleData.titles.map((title, index) => <article className={selected === title ? 'selected' : ''} key={title}><button className="title-select" onClick={() => chooseTitle(title)}><span>0{index + 1}</span><strong>{title}</strong></button><button className="title-copy" aria-label={`复制标题：${title}`} onClick={() => navigator.clipboard.writeText(title)}>复制</button></article>)}</div>}
          {selected && <button className={`generate ${generationBusy ? 'loading' : ''}`} disabled={generationBusy} onClick={() => generate.mutate()}>{generationBusy ? <><i aria-hidden="true" />正在生成完整内容…</> : generation ? '按当前标题重新生成一版 →' : isVideo ? '生成正文、封面与视频分镜 →' : '生成图文正文与封面 →'}</button>}
        </section>
        <CreationWorkbench versions={versions} activeId={generation?.id || ''} onOpen={openVersion} onRemove={removeVersion} removing={removingVersion} />
      </div>
      {generation && <GeneratedResult data={generation} onRetry={() => generate.mutate()} retrying={generate.isPending} sourceIsVideo={isVideo} />}
    </>
  );
}

function History({ records, activeId, open, remove, removing }: { records: Analysis[]; activeId: string; open: (id: string) => void; remove: (id: string, title: string) => void; removing: boolean }) {
  return (
    <>
      <header className="page-head"><div><div className="page-kicker">ARCHIVE / {records.length} REPORTS</div><h2>历史记录</h2></div><p>打开过去的分析报告，或删除不再需要的记录及其复刻内容。</p></header>
      {records.length ? (
        <section className="history-list">
          {records.map((record, index) => { const title = record.note?.title || '等待获取笔记'; return (
            <article className={record.id === activeId ? 'current' : ''} key={record.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <button className="history-open" onClick={() => open(record.id)}><strong>{title}</strong><small>{new Date(record.created_at).toLocaleString('zh-CN')} · {record.status}</small></button>
              <b className={`history-status ${record.status}`}>{record.status === 'completed' ? '已完成' : record.status === 'failed' ? '失败' : '处理中'}</b>
              <button className="history-delete" disabled={!['completed', 'failed'].includes(record.status) || removing} onClick={() => remove(record.id, title)}>删除</button>
            </article>
          ); })}
        </section>
      ) : <section className="history-empty"><p>还没有分析记录。</p></section>}
    </>
  );
}

function Studio() {
  const [section, setSection] = useState<Section>('new');
  const [url, setUrl] = useState('');
  const [activeId, setActiveId] = useState('');
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [brief, setBrief] = useState('');
  const [titleData, setTitleData] = useState<{ session_id: string; titles: string[] } | null>(null);
  const [selected, setSelected] = useState('');
  const [activeGeneration, setActiveGeneration] = useState<Generation | null>(null);
  const [historyReturn, setHistoryReturn] = useState<Section>('insights');
  const [preserveReuseBrief, setPreserveReuseBrief] = useState(false);

  const history = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses });
  const generationVersions = useQuery({
    queryKey: ['generation-versions', activeId],
    queryFn: () => listGenerationsByAnalysis(activeId),
    enabled: !!activeId && section === 'reuse',
  });
  const savedCreation = useQuery({
    queryKey: ['saved-creation', activeId],
    queryFn: () => latestCreation(activeId),
    enabled: !!activeId && section === 'reuse' && !titleData && !activeGeneration && !preserveReuseBrief && !brief.trim(),
  });

  const handleAnalyzeStage = (a: Analysis) => { setActiveAnalysis(a); setActiveId(a.id); };
  const handleGenerateStage = (g: Generation) => setActiveGeneration(g);

  const create = useMutation({
    mutationFn: async () => {
      const validated = validateXhsUrl(url);
      return analyzeFlow(validated, { onStage: handleAnalyzeStage });
    },
    onSuccess: (a) => { setActiveId(a.id); setSection('insights'); history.refetch(); },
    onError: () => { history.refetch(); },
  });
  const retry = useMutation({
    mutationFn: () => {
      if (!activeAnalysis) throw new Error('没有可重试的分析');
      return analyzeFlow(activeAnalysis.source_url, { id: activeAnalysis.id, onStage: handleAnalyzeStage });
    },
    onSuccess: () => { history.refetch(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAnalysis(id),
    onSuccess: (_, id) => { if (activeId === id) { setActiveId(''); setActiveAnalysis(null); resetCreation(); } history.refetch(); },
  });
  const titles = useMutation({
    mutationFn: () => {
      if (!activeAnalysis) throw new Error('请先选择一篇已分析的笔记');
      return generateTitlesFlow(activeAnalysis, brief);
    },
    onSuccess: (data) => { setTitleData({ session_id: data.session_id, titles: data.titles }); setSelected(''); },
  });
  const generate = useMutation({
    mutationFn: () => {
      if (!activeAnalysis || !titleData) throw new Error('请先生成并选择标题');
      const session: Session = { session_id: titleData.session_id, brief, titles: titleData.titles, selected_title: selected };
      return generateFlow(activeAnalysis, session, selected, { onStage: handleGenerateStage });
    },
    onSuccess: () => { generationVersions.refetch(); savedCreation.refetch(); },
    onError: () => { generationVersions.refetch(); },
  });
  const removeGeneration = useMutation({
    mutationFn: (id: string) => deleteGeneration(id),
    onSuccess: async (_, id) => {
      if (activeGeneration?.id === id) { setBrief(''); setTitleData(null); setSelected(''); setActiveGeneration(null); }
      await generationVersions.refetch();
      await savedCreation.refetch();
    },
  });

  useEffect(() => {
    const saved = savedCreation.data;
    if (brief.trim() || preserveReuseBrief || !saved?.session || titleData) return;
    setBrief(saved.session.brief || '');
    setTitleData({ session_id: saved.session.session_id, titles: saved.session.titles });
    setSelected(saved.session.selected_title || '');
    if (saved.generation) setActiveGeneration(saved.generation);
  }, [savedCreation.data, titleData, preserveReuseBrief, brief]);

  function resetCreation() { setBrief(''); setTitleData(null); setSelected(''); setActiveGeneration(null); setPreserveReuseBrief(false); }

  async function openHistory(id: string) {
    const analysis = await getAnalysis(id);
    setActiveAnalysis(analysis);
    setActiveId(id);
    resetCreation();
    setSection(historyReturn === 'reuse' ? 'reuse' : 'insights');
  }

  function switchReuseSource(id: string) {
    if (id !== activeId) { setTitleData(null); setSelected(''); setActiveGeneration(null); setPreserveReuseBrief(true); }
    getAnalysis(id).then((analysis) => { setActiveAnalysis(analysis); setActiveId(id); });
    setSection('reuse');
  }

  function navigate(next: Section) { if (next === 'history') setHistoryReturn(section === 'reuse' ? 'reuse' : 'insights'); setSection(next); }
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  function chooseTitle(title: string) { setSelected(title); setActiveGeneration(null); }
  function openVersion(version: CreationVersion) {
    setPreserveReuseBrief(false);
    setBrief(version.brief || '');
    setTitleData({ session_id: version.session_id, titles: version.titles });
    setSelected(version.selected_title || '');
    getGeneration(version.id).then((g) => setActiveGeneration(g));
  }
  function removeVersion(version: CreationVersion) { if (window.confirm(`确定删除复刻版本“${version.selected_title}”吗？原始爆款分析不会被删除。`)) removeGeneration.mutate(version.id); }
  function removeRecord(id: string, title: string) { if (window.confirm(`确定删除“${title}”吗？相关报告和生成内容也会一并删除。`)) remove.mutate(id); }

  const item = activeAnalysis;
  const records = history.data || [];

  function content() {
    if (section === 'new') return (
      <>
        <header className="hero"><div className="page-kicker">XIAOHONGSHU VIRAL ANALYSIS / 01</div><h1><span>小红书爆款拆解</span><em>看清内容为什么爆。</em></h1><p>粘贴公开小红书笔记链接，系统会读取正文、画面、互动指标与评论样本。</p></header>
        <section className="command">
          <div><span className="command-number">01</span><h2>输入笔记链接</h2></div>
          <form onSubmit={submit}>
            <label htmlFor="note-url">小红书笔记链接</label>
            <div className="command-field"><input id="note-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.xiaohongshu.com/explore/..." /><button disabled={create.isPending}>{create.isPending ? '正在创建…' : '开始分析（2积分）→'}</button></div>
            {create.error ? <p className="error">{(create.error as Error).message}</p> : null}
            <small>支持公开图文、视频及 xhslink 短链接。每次分析消耗 2 积分。</small>
          </form>
        </section>
      </>
    );
    if (section === 'history') return <History records={records} activeId={activeId} open={openHistory} remove={removeRecord} removing={remove.isPending} />;
    const selectedCompleted = records.some((record) => record.id === activeId && record.status === 'completed') ? activeId : '';
    const selector = <NoteSelector records={records} value={selectedCompleted} onChange={section === 'insights' ? openHistoryForInsights : switchReuseSource} label={section === 'insights' ? '切换分析好的帖子' : '选择要复刻的历史爆款'} />;
    if (!item) return <div className="empty-feature-stack"><EmptyFeature type={section} setSection={navigate} />{selector}</div>;
    if (item.status !== 'completed') return <>{selector}<Processing item={item} onRetry={() => retry.mutate()} retrying={retry.isPending} /></>;
    if (section === 'insights') return <>{selector}<Report item={item} /></>;
    return <Reuse item={item} records={records} openSource={switchReuseSource} brief={brief} setBrief={setBrief} titleData={titleData} selected={selected} chooseTitle={chooseTitle} titles={titles} generate={generate} generation={activeGeneration || undefined} versions={generationVersions.data || []} openVersion={openVersion} removeVersion={removeVersion} removingVersion={removeGeneration.isPending} />;
  }

  function openHistoryForInsights(id: string) { openHistory(id); }

  return (
    <main id="main" className="app-shell">
      <Sidebar section={section} setSection={navigate} item={item || undefined} count={records.length} />
      <div className="app-content">
        <div className="topbar"><span>AI 小红书爆款分析智能体</span><b>{item?.status === 'completed' ? '报告就绪' : item ? '任务进行中' : 'MVP'}</b></div>
        {content()}
      </div>
    </main>
  );
}

const client = new QueryClient();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <a className="skip" href="#main">跳到主要内容</a>
      <Studio />
    </QueryClientProvider>
  </React.StrictMode>,
);
