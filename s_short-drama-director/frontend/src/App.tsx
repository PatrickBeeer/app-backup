import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Clapperboard,
  Copy,
  Download,
  LoaderCircle,
  Sparkles,
  Upload,
} from 'lucide-react'
import { appStorageKey, defaultFormState, perspectiveOptions, styleOptions } from './constants'
import { generateStoryboard } from './lib/api'
import { buildMarkdownExport, downloadFile } from './lib/exports'
import type { FormState, StoryboardResponse } from './types'

function App() {
  const [form, setForm] = useState<FormState>(() => loadFormState())
  const [result, setResult] = useState<StoryboardResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  useEffect(() => {
    window.localStorage.setItem(appStorageKey, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    if (!copiedKey) {
      return
    }

    const timer = window.setTimeout(() => setCopiedKey(''), 1500)
    return () => window.clearTimeout(timer)
  }, [copiedKey])

  async function handleGenerate() {
    if (form.story.trim().length < 20) {
      setError('请先输入至少 20 个字符的故事内容。')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await generateStoryboard({
        story: form.story.trim(),
        targetDurationSeconds: form.targetDurationSeconds,
        style: form.style,
        perspective: form.perspective,
        characterAppearance: form.characterAppearance.trim(),
        extraRequirements: form.extraRequirements.trim(),
      })

      setResult(response)
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '生成失败，请稍后重试。',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) {
      return
    }

    const content = await file.text()
    setForm((current) => ({
      ...current,
      story: content,
    }))
    setError('')
  }

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
  }

  function handleExportJson() {
    if (!result) {
      return
    }

    downloadFile(
      `${safeFileName(result.title)}.json`,
      JSON.stringify(result, null, 2),
      'application/json;charset=utf-8',
    )
  }

  function handleExportMarkdown() {
    if (!result) {
      return
    }

    downloadFile(
      `${safeFileName(result.title)}.md`,
      buildMarkdownExport(result),
      'text/markdown;charset=utf-8',
    )
  }

  return (
    <main className="studio-shell">
      <div className="studio-grid">
        <section className="composer-panel">
          <div className="panel-tag">
            <Clapperboard size={16} />
            AI短剧导演
          </div>

          <div className="composer-head">
            <div>
              <p className="mini-label">创作输入</p>
              <h1>左侧设定故事，右侧直接看分镜结果</h1>
            </div>
            <button
              className="generate-button"
              onClick={() => void handleGenerate()}
              disabled={loading}
              type="button"
            >
              {loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {loading ? '生成中' : '生成分镜（20积分）'}
            </button>
          </div>

          <div className="field-section">
            <div className="section-head">
              <div>
                <h2>故事内容</h2>
                <p>直接粘贴梗概，或上传脚本文本。</p>
              </div>
              <label className="secondary-button upload-button">
                <Upload size={16} />
                上传文本
                <input
                  type="file"
                  accept=".txt,.md,.markdown"
                  onChange={(event) => void handleFileUpload(event.target.files?.[0])}
                />
              </label>
            </div>
            <textarea
              className="story-area"
              placeholder="例：一名年轻导演在深夜工作室里整理最后一版故事板，必须在天亮前把凌乱情节拆成清晰的分镜，并确保每个镜头都不超过十秒。"
              value={form.story}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  story: event.target.value,
                }))
              }
            />
          </div>

          <div className="compact-grid">
            <section className="field-section">
              <div className="section-head compact">
                <div>
                  <h2>目标时长</h2>
                  <p>{form.targetDurationSeconds} 秒</p>
                </div>
              </div>
              <input
                className="range-input"
                type="range"
                min={10}
                max={180}
                step={5}
                value={form.targetDurationSeconds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetDurationSeconds: Number(event.target.value),
                  }))
                }
              />
              <div className="range-legend">
                <span>10 秒</span>
                <span>90 秒</span>
                <span>180 秒</span>
              </div>
            </section>

            <section className="field-section">
              <div className="section-head compact">
                <div>
                  <h2>角色外观</h2>
                  <p>可选</p>
                </div>
              </div>
              <textarea
                className="mini-area"
                placeholder="例：30岁男性，灰色夹克，短寸发，背黑色双肩包。"
                value={form.characterAppearance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    characterAppearance: event.target.value,
                  }))
                }
              />
            </section>
          </div>

          <div className="field-section">
            <div className="section-head compact">
              <div>
                <h2>风格</h2>
                <p>决定镜头语言和提示词质感。</p>
              </div>
            </div>
            <div className="choice-grid">
              {styleOptions.map((option) => (
                <SelectableCard
                  key={option.value}
                  active={form.style === option.value}
                  label={option.label}
                  description={option.description}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      style: option.value,
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="compact-grid">
            <section className="field-section">
              <div className="section-head compact">
                <div>
                  <h2>视角</h2>
                  <p>决定景别和镜头约束。</p>
                </div>
              </div>
              <div className="choice-grid short">
                {perspectiveOptions.map((option) => (
                  <SelectableCard
                    key={option.value}
                    active={form.perspective === option.value}
                    label={option.label}
                    description={option.description}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        perspective: option.value,
                      }))
                    }
                  />
                ))}
              </div>
            </section>

            <section className="field-section">
              <div className="section-head compact">
                <div>
                  <h2>补充要求</h2>
                  <p>可选</p>
                </div>
              </div>
              <textarea
                className="mini-area"
                placeholder="例：整体偏压抑；每组镜头换空间开场；最后一镜保持人物面部清晰。"
                value={form.extraRequirements}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    extraRequirements: event.target.value,
                  }))
                }
              />
            </section>
          </div>

          {error ? (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : null}
        </section>

        <section className="result-panel">
          <div className="result-head">
            <div>
              <p className="mini-label">分镜结果</p>
              <h2>{result ? result.title : '生成后在这里查看结果'}</h2>
            </div>
            {result ? (
              <div className="result-actions">
                <button className="secondary-button" onClick={handleExportMarkdown} type="button">
                  <Download size={16} />
                  Markdown
                </button>
                <button className="secondary-button" onClick={handleExportJson} type="button">
                  <Download size={16} />
                  JSON
                </button>
              </div>
            ) : null}
          </div>

          {result ? (
            <div className="result-content">
              <section className="summary-card">
                <p className="summary-text">{result.summary}</p>
                <div className="summary-metrics">
                  <Metric label="总时长" value={`${result.totalDurationSeconds} 秒`} />
                  <Metric label="镜头数" value={`${result.shots.length}`} />
                  <Metric
                    label="最长镜头"
                    value={`${result.qualityChecklist.maxShotDurationSeconds} 秒`}
                  />
                </div>
              </section>

              <section className="detail-card">
                <div className="detail-title">统一角色设定</div>
                <p>{result.characterProfile}</p>
              </section>

              <section className="detail-card">
                <div className="detail-title">时长校验</div>
                <p>
                  {result.qualityChecklist.durationsValidated ? '已通过单镜头时长校验。' : '存在超时镜头，建议重新生成。'}
                </p>
                {result.qualityChecklist.warnings.length > 0 ? (
                  <ul className="warning-list">
                    {result.qualityChecklist.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <div className="shot-list">
                {result.shots.map((shot) => (
                  <article className="shot-card" key={shot.id}>
                    <div className="shot-meta">
                      <span className="shot-index">镜头 {shot.id}</span>
                      <span className="shot-duration">{shot.durationSeconds} 秒</span>
                    </div>

                    <div className="shot-block">
                      <div className="detail-title">场景描述</div>
                      <p>{shot.sceneDescription}</p>
                    </div>

                    <PromptBlock
                      title="文生图提示词"
                      value={shot.imagePrompt}
                      copied={copiedKey === `image-${shot.id}`}
                      onCopy={() => void handleCopy(shot.imagePrompt, `image-${shot.id}`)}
                    />

                    <PromptBlock
                      title="图生视频提示词"
                      value={shot.videoPrompt}
                      copied={copiedKey === `video-${shot.id}`}
                      onCopy={() => void handleCopy(shot.videoPrompt, `video-${shot.id}`)}
                    />

                    {shot.note ? (
                      <div className="shot-note">
                        <span>备注</span>
                        <p>{shot.note}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <div className="empty-frame">
                <Sparkles size={28} />
                <h3>先完成左侧输入，再生成分镜</h3>
                <p>这里会显示故事摘要、角色设定、镜头拆分和提示词结果。</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function SelectableCard(props: {
  active: boolean
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className={`selectable-card ${props.active ? 'active' : ''}`}
      onClick={props.onClick}
      type="button"
    >
      <strong>{props.label}</strong>
      <span>{props.description}</span>
    </button>
  )
}

function PromptBlock(props: {
  title: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="prompt-block">
      <div className="prompt-head">
        <span>{props.title}</span>
        <button className="copy-button" onClick={props.onCopy} type="button">
          <Copy size={14} />
          {props.copied ? '已复制' : '复制'}
        </button>
      </div>
      <p>{props.value}</p>
    </div>
  )
}

function loadFormState(): FormState {
  const raw = window.localStorage.getItem(appStorageKey)

  if (!raw) {
    return defaultFormState
  }

  try {
    return { ...defaultFormState, ...JSON.parse(raw) }
  } catch {
    return defaultFormState
  }
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-')
}

export default App
