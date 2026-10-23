import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Layers3,
  MonitorUp,
  Palette,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { createDefaultProject, type WallProject } from './shared/wall';
import { generateWallImage } from './services/imageGeneration';
import './styles.css';

type UploadAsset = {
  name: string;
  dataUrl: string;
};

type GeneratedAsset = {
  title: string;
  src: string;
};

function App() {
  const [project, setProject] = useState<WallProject>(() => createDefaultProject());
  const [structureImage, setStructureImage] = useState<UploadAsset | null>(null);
  const [referenceImage, setReferenceImage] = useState<UploadAsset | null>(null);
  const [designResult, setDesignResult] = useState<GeneratedAsset | null>(null);
  const [renderResult, setRenderResult] = useState<GeneratedAsset | null>(null);
  const [designApproved, setDesignApproved] = useState(false);
  const [status, setStatus] = useState('上传结构设计图并填写需求后开始生成。');
  const [isGenerating, setIsGenerating] = useState(false);

  function updateProject(patch: Partial<WallProject>) {
    setProject((current) => ({ ...current, ...patch }));
    setDesignApproved(false);
    setDesignResult(null);
    setRenderResult(null);
    setStatus('内容已调整，请重新生成平面设计图。');
  }

  async function handleFileChange(kind: 'structure' | 'reference', file?: File) {
    if (!file) return;
    const asset = {
      name: file.name,
      dataUrl: await readFileAsDataUrl(file)
    };

    if (kind === 'structure') {
      setStructureImage(asset);
      setDesignResult(null);
      setRenderResult(null);
      setDesignApproved(false);
      setStatus('结构设计图已上传，请填写需求后生成平面设计图。');
    } else {
      setReferenceImage(asset);
      setDesignResult(null);
      setRenderResult(null);
      setDesignApproved(false);
      setStatus('参考图已上传，请重新生成平面设计图。');
    }
  }

  async function generateDesignImage() {
    if (!structureImage) {
      setStatus('请先上传结构设计图。');
      return;
    }

    if (!project.requirement.trim()) {
      setStatus('请先填写生成需求。');
      return;
    }

    setIsGenerating(true);
    setStatus('正在通过 API Manager 生成平面设计图...');
    try {
      const image = await generateWallImage(project, 'design', [
        structureImage,
        ...(referenceImage ? [referenceImage] : [])
      ]);
      setDesignResult({ title: '平面设计图', src: image });
      setRenderResult(null);
      setDesignApproved(false);
      setStatus('平面设计图已生成，请确认后再生成效果图。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '平面设计图生成失败');
    } finally {
      setIsGenerating(false);
    }
  }

  function approveDesign() {
    if (!designResult) {
      setStatus('请先生成平面设计图。');
      return;
    }
    setDesignApproved(true);
    setStatus('平面设计图已确认，可以生成效果图。');
  }

  async function generateRenderImage() {
    if (!designResult || !designApproved) {
      setStatus('请先生成并确认平面设计图。');
      return;
    }

    setIsGenerating(true);
    setStatus('正在通过 API Manager 生成效果图...');
    try {
      const image = await generateWallImage(project, 'render', [{ name: 'approved-flat-design.png', dataUrl: designResult.src }]);
      setRenderResult({ title: '效果图', src: image });
      setStatus('效果图已生成。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '效果图生成失败');
    } finally {
      setIsGenerating(false);
    }
  }

  const workflowSteps = [
    { label: '上传结构', done: Boolean(structureImage), active: !structureImage },
    { label: '平面设计', done: Boolean(designResult), active: Boolean(structureImage) && !designResult },
    { label: '确认方案', done: designApproved, active: Boolean(designResult) && !designApproved },
    { label: '生成效果图', done: Boolean(renderResult), active: designApproved && !renderResult }
  ];

  return (
    <main className="app-shell">
      <header className="topbar simple-topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <MonitorUp size={22} />
          </div>
          <div>
            <h1>形象墙效果图设计</h1>
            <p>上传结构设计图与风格参考，先出平面方案，确认后生成空间效果图。</p>
          </div>
        </div>
        <div className="workflow-strip">
          {workflowSteps.map((step, index) => (
            <div
              className={`workflow-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}
              key={step.label}
            >
              <span>{step.done ? <CheckCircle2 size={14} /> : index + 1}</span>
              {step.label}
            </div>
          ))}
        </div>
      </header>

      <section className="simple-layout">
        <section className="input-panel">
          <div className="panel-heading">
            <div>
              <h2>项目资料</h2>
              <p>结构图锁定尺寸与开口，参考图只提取风格、配色和元素语言。</p>
            </div>
            <Layers3 size={20} />
          </div>

          <div className="upload-grid">
            <UploadBox
              title="结构设计图"
              required
              asset={structureImage}
              onChange={(file) => handleFileChange('structure', file)}
            />
            <UploadBox
              title="风格参考图"
              asset={referenceImage}
              onChange={(file) => handleFileChange('reference', file)}
            />
          </div>

          <div className="form-stack">
            <label>
              项目标题
              <input value={project.title} onChange={(event) => updateProject({ title: event.target.value })} />
            </label>
            <label>
              生成需求
              <textarea
                value={project.requirement}
                onChange={(event) => updateProject({ requirement: event.target.value })}
                placeholder="例如：按上传结构图做蓝白科技风背景墙，门、窗、电箱不要覆盖；左侧地图，中间主文案，右侧数据看板。"
              />
            </label>
            <label>
              风格补充
              <textarea
                className="compact-textarea"
                value={project.designReference}
                onChange={(event) => updateProject({ designReference: event.target.value })}
                placeholder="可描述参考图风格、颜色、构图、材质、希望规避的问题。"
              />
            </label>
          </div>

          <div className="action-row">
            <button className="primary" onClick={generateDesignImage} disabled={isGenerating}>
              <Sparkles size={16} /> 生成平面设计图
            </button>
            <button className={designApproved ? 'approved' : ''} onClick={approveDesign} disabled={!designResult || isGenerating}>
              <CheckCircle2 size={16} /> 确认平面图
            </button>
            <button onClick={generateRenderImage} disabled={!designApproved || isGenerating}>
              <Sparkles size={16} /> 生成效果图
            </button>
          </div>

          <div className="status-line">{status}</div>
        </section>

        <section className="output-panel">
          <div className="output-titlebar">
            <div>
              <h2>设计输出</h2>
              <p>左侧修改资料后需要重新生成平面设计图，再确认生成效果图。</p>
            </div>
            <Palette size={20} />
          </div>
          <ResultCard title="平面设计图" asset={designResult} emptyText="生成后的平面设计图会显示在这里。" />
          <ResultCard title="效果图" asset={renderResult} emptyText="确认平面图后，效果图会显示在这里。" />
        </section>
      </section>
    </main>
  );
}

function UploadBox({
  title,
  required,
  asset,
  onChange
}: {
  title: string;
  required?: boolean;
  asset: UploadAsset | null;
  onChange: (file?: File) => void;
}) {
  return (
    <label className={`upload-box ${asset ? 'has-asset' : ''}`}>
      <input
        type="file"
        accept="image/*"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      {asset ? (
        <img src={asset.dataUrl} alt={title} />
      ) : (
        <div className="upload-placeholder">
          <UploadCloud size={28} />
          <strong>{title}</strong>
          <span>{required ? '必填' : '可选'}</span>
        </div>
      )}
      {asset && <small>{asset.name}</small>}
    </label>
  );
}

function ResultCard({
  title,
  asset,
  emptyText
}: {
  title: string;
  asset: GeneratedAsset | null;
  emptyText: string;
}) {
  return (
    <section className="result-card">
      <div className="result-heading">
        {asset ? <ImageIcon size={18} /> : <FileText size={18} />}
        <h2>{asset?.title ?? title}</h2>
      </div>
      {asset ? <img src={asset.src} alt={asset.title} /> : <div className="empty-image">{emptyText}</div>}
    </section>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById('root')!).render(<App />);
