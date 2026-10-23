import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, ImagePlus, LoaderCircle, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import { createVideoTask, getVideoTask, type VideoTask } from '../services/videoService';

const SCENES = [
  ['drive', '驾驶场景'],
  ['leisure', '品质休闲'],
  ['closeup', '产品特写'],
  ['business', '商务社交'],
  ['travel', '旅行户外'],
  ['night', '夜间光感'],
] as const;

const DEFAULT_PROMPT = '一支完全符合现实摄影规律的眼镜品牌短片，像真实摄影师使用全画幅相机实景拍摄，而非 CG 或 AI 合成。只使用用户上传的眼镜作为产品参考，镜框、镜片、材质、颜色、尺寸和结构全程不变。使用真实生活场景、自然光影和克制的摄影机运动展示佩戴效果与产品细节。画面高级、真实、稳定，不添加文字、水印或音乐。';

const ORIGINALITY_REQUIREMENTS = '原创与版权要求：画面必须为完全原创的无品牌商业摄影，不模仿、复刻或引用任何现有广告、电影、角色、艺术家、导演、摄影师或品牌的可识别风格。不生成任何品牌 Logo、商标、包装文字、版权图案或可识别的影视元素。';

const CUTTING_REQUIREMENTS = '剪辑与转场要求：允许使用干净利落的闪切或硬切，但必须在人物动作的自然停顿点、视线方向一致处或相似构图之间切换。每个镜头必须是完整、独立且稳定的真实摄影片段。禁止溶解融合、人脸渐变、人物与背景粘连、产品变形、空间拉伸、快速推拉、旋转甩镜、虚假遮挡转场或任何 AI 变形式过渡。';

const normalizeVideoError = (message: string) => /copyright|copyright restrictions|版权|著作权/i.test(message)
  ? '视频模型触发了版权限制。请使用不含品牌 Logo、包装文字或影视画面的原创产品图，并避免在导演指令中提及现有品牌、广告、导演或影视作品后重试。'
  : message;

const SCENE_PROMPTS: Record<string, string> = {
  drive: '真实轿车驾驶舱内的眼镜品牌短片：成熟模特坐在驾驶位佩戴眼镜，城市道路光线从车窗自然进入，镜头平滑展示侧脸、中景佩戴效果、方向盘与镜片反光细节。画面稳重、专业、真实。',
  leisure: '品质休闲生活方式眼镜短片：模特在咖啡馆、湖边或轻户外环境中自然佩戴眼镜，镜头从生活场景切换到舒缓的中景和产品细节，使用温暖自然光，传达从容、可靠与高级感。',
  closeup: '眼镜产品质感特写短片：以干净深色背景和柔和侧光展示镜框轮廓、镜片透光、鼻梁、镜腿连接和金属细节，使用稳定微距推进，突出材质、结构与真实反光。',
  business: '成熟商务社交场景的眼镜品牌短片：模特在现代酒店、会议空间或城市街道中自然佩戴眼镜，镜头展示交流、行走、正面和侧面佩戴状态，光线克制，传达专业、可信和高级气质。',
  travel: '旅行户外眼镜短片：模特在山路、海岸或机场出发场景中佩戴眼镜，镜头捕捉移动中的自然光、风感和环境变化，并平滑展示眼镜在不同光线下的佩戴效果，真实且有探索感。',
  night: '城市夜间光感眼镜短片：模特在夜晚街道或车内佩戴眼镜，霓虹灯和车流形成克制反光，镜头展示镜片高光、轮廓与沉稳表情，整体具有电影感但保持真实摄影质感。',
};

const durationGuide = (seconds: number) => {
  if (seconds <= 6) return '镜头结构：全片约2个镜头。镜头1用真实场景建立氛围并让模特自然入画；镜头2展示佩戴状态和眼镜细节。两个完整镜头之间使用1次干净硬切。';
  if (seconds <= 9) return '镜头结构：全片最多3个镜头。镜头1建立真实环境，镜头2展示模特佩戴和小幅度自然动作，镜头3展示镜框、镜片反光与材质细节。每个镜头保持约2-3秒，只做缓慢、稳定、幅度很小的运镜。';
  if (seconds <= 12) return '镜头结构：全片最多3个镜头。依次安排环境建立、人物中景自然佩戴、产品局部特写。每个镜头完整保持3-4秒，仅使用舒缓推近或轻微横移，不要密集切换。';
  return '镜头结构：全片最多4个镜头，适配完整15秒品牌短片。镜头1用真实生活场景建立氛围；镜头2展示模特轻微转头或缓慢行走；镜头3用侧面或近距离展示镜框、镜片反光、鼻梁和镜腿细节；镜头4回到自然佩戴状态收束。每个镜头保持3-4秒，镜头之间使用干净硬切，保持同一模特、同一副眼镜和连续空间关系。';
};

const buildScenePrompt = (scene: string, duration: number) => `${SCENE_PROMPTS[scene] || DEFAULT_PROMPT}\n\n${durationGuide(duration)}\n\n${CUTTING_REQUIREMENTS}\n\n真实摄影约束：眼镜始终是唯一核心产品，镜框、镜片、材质、颜色、尺寸和结构全程不变，眼镜稳定贴合鼻梁和耳部，不漂移、不变形、不穿模。同一模特的五官、发型、服装和体型保持一致；眼球、眨眼、呼吸、转头、手指和行走动作符合真实人体运动规律，幅度小且连贯，不要慢动作拉扯、橡皮感、瞬移或肢体错位。光照方向、阴影、景深、镜片折射和环境反射符合物理规律，保留轻微相机噪点与自然运动模糊，禁止 CG 渲染感、过度锐化、过度磨皮、HDR 光晕和虚假散景。不添加文字、Logo、水印或音乐。\n\n${ORIGINALITY_REQUIREMENTS}`;

export const VideoGenerationPanel: React.FC = () => {
  const [scene, setScene] = useState('drive');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [ratio, setRatio] = useState<'9:16' | '16:9'>('9:16');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [assets, setAssets] = useState<Array<{ name: string; url: string; dataUrl: string }>>([]);
  const [task, setTask] = useState<VideoTask>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canGenerate = prompt.trim().length > 12 && assets.length > 0 && !['queued', 'running'].includes(task.status);
  const progress = task.status === 'queued' ? 18 : task.status === 'running' ? 67 : task.status === 'succeeded' ? 100 : 0;
  const videoUrl = task.status === 'succeeded' && task.id ? `/api/video/tasks/${task.id}/video` : '';

  useEffect(() => {
    setPrompt(buildScenePrompt(scene, duration));
  }, [scene, duration]);

  useEffect(() => {
    if (!task.id || !['queued', 'running'].includes(task.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getVideoTask(task.id!);
        setTask(next);
        if (next.status === 'failed') {
          const message = typeof next.error === 'string' ? next.error : next.error?.message || '视频生成失败';
          setError(normalizeVideoError(message));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '视频任务查询失败');
        setTask((current) => ({ ...current, status: 'failed' }));
      }
    }, 1400);
    return () => window.clearInterval(timer);
  }, [task.id, task.status]);

  const handleFiles = (files: FileList | null) => {
    const picked = Array.from(files || []).filter((file) => file.type.startsWith('image/')).slice(0, 9 - assets.length);
    Promise.all(picked.map((file) => new Promise<{ name: string; url: string; dataUrl: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, url: URL.createObjectURL(file), dataUrl: String(reader.result) });
      reader.readAsDataURL(file);
    }))).then((next) => setAssets((current) => [...current, ...next]));
  };

  const generate = async () => {
    if (!canGenerate) return;
    setError(null);
    setTask({ status: 'queued' });
    try {
      setTask(await createVideoTask({ prompt, ratio, duration, resolution, scene, imageDataUrls: assets.map((asset) => asset.dataUrl) }));
    } catch (err) {
      setError(normalizeVideoError(err instanceof Error ? err.message : '视频任务创建失败'));
      setTask({ status: 'failed' });
    }
  };

  const statusText = useMemo(() => ({ idle: '准备生成', queued: '已进入生成队列', running: '正在捕捉质感光线', succeeded: '生成完成', failed: '生成未完成' }[task.status]), [task.status]);

  return <div className="video-studio-grid">
    <section className="video-control-card">
      <div className="video-card-heading"><div><span className="video-kicker">VIDEO STUDIO</span><h2>生成眼镜品牌短片</h2></div><Film size={22} /></div>
      <div className="video-form-section"><div className="video-section-title"><span>产品素材</span><small>{assets.length}/9</small></div>
        {assets.length ? <div className="video-assets">{assets.map((asset, index) => <div className="video-asset" key={`${asset.name}-${index}`}><img src={asset.url} alt={asset.name} /><span>{asset.name}</span><button type="button" onClick={() => setAssets((current) => current.filter((_, i) => i !== index))} aria-label="移除素材"><X size={13} /></button></div>)}<button type="button" className="video-add-asset" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> 添加素材</button></div> : <button type="button" className="video-upload" onClick={() => fileRef.current?.click()}><ImagePlus size={22} /><strong>上传产品图片</strong><small>支持多张 JPG / PNG / WEBP 参考图</small></button>}
        <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }} />
      </div>
      <div className="video-form-section"><div className="video-section-title"><span>场景类型</span></div><div className="video-scene-pills">{SCENES.map(([key, label]) => <button type="button" key={key} className={scene === key ? 'active' : ''} onClick={() => setScene(key)}>{label}</button>)}</div></div>
      <div className="video-form-section"><div className="video-section-title"><span>导演指令</span><button type="button" onClick={() => setPrompt(buildScenePrompt(scene, duration))}><RefreshCw size={13} /></button></div><textarea value={prompt} maxLength={2400} onChange={(event) => setPrompt(event.target.value)} /></div>
      <div className="video-form-section"><div className="video-section-title"><span>输出规格</span></div><div className="video-options"><div className="video-ratio-field"><label>画幅比例</label><div className="video-option-pills">{(['9:16', '16:9'] as const).map((value) => <button type="button" key={value} className={ratio === value ? 'active' : ''} onClick={() => setRatio(value)}><strong>{value}</strong><small>{value === '9:16' ? '竖屏 · 短视频' : '横屏 · 品牌片'}</small></button>)}</div></div><label>时长<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{Array.from({ length: 11 }, (_, index) => index + 5).map((value) => <option key={value} value={value}>{value} 秒</option>)}</select></label><label>清晰度<select value={resolution} onChange={(event) => setResolution(event.target.value as '720p' | '1080p')}><option value="720p">720P</option><option value="1080p">1080P</option></select></label></div></div>
      <button type="button" className="video-generate-button" disabled={!canGenerate} onClick={generate}>{task.status === 'queued' || task.status === 'running' ? <><LoaderCircle className="spin" size={17} /> 生成中…</> : <><Sparkles size={17} /> 生成视频</>}</button>
      {error && <div className="video-error">{error}</div>}
    </section>
    <section className={`video-preview-card ${task.status !== 'idle' ? 'has-task' : ''}`}><div className="video-card-heading"><div><span className="video-kicker">PREVIEW</span><h2>{statusText}</h2></div><span className="video-progress">{progress}%</span></div>{videoUrl ? <><video className="video-result-player" src={videoUrl} controls playsInline /><a className="video-download" href={videoUrl} download={`eyewear-${scene}-${duration}s.mp4`}><Download size={15} /> 下载视频</a></> : <div className="video-preview-placeholder"><div className="video-play-mark">{task.status === 'queued' || task.status === 'running' ? <span className="video-progress-ring">{progress}%</span> : <Play size={24} />}</div><strong>{task.status === 'idle' ? '你的品牌片将在这里播放' : task.status === 'failed' ? '这次生成没有完成' : '视频生成中'}</strong><small>{task.status === 'idle' ? '上传产品素材并完成设置后开始生成' : task.status === 'failed' ? '请检查导演指令后重试' : '任务完成后会自动显示预览'}</small></div>}</section>
  </div>;
};
