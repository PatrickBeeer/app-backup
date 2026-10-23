import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { generateTryOnImage } from '../services/videoService';
import { uploadAssetToCOSWithPresignedURL } from '../../../../shared_services/geminiProxyService';
import { createTaskQueueItem, recordTaskManagerObject } from '../../../../services/taskManagerService';
import { ImageUploader } from './ImageUploader';
import { OptionsSelector } from './OptionsSelector';
import { GeneratedImageDisplay, type Generation } from './GeneratedImageDisplay';
import { Spinner } from './Spinner';

const APP_ID = 'glasses-video';
const IMAGE_GEN_COST = 10;

const scenes = [
  { value: 'outdoor', label: '户外生活', subLabel: '自然的微风光影' },
  { value: 'street', label: '城市街拍', subLabel: '现代建筑/街头时尚' },
  { value: 'driving', label: '驾驶场景', subLabel: '真实驾驶舱/座舱光影' },
  { value: 'fishing', label: '钓鱼休闲', subLabel: '水岸/悠闲光影' },
  { value: 'climbing', label: '山地攀登', subLabel: '岩壁/工业质感' },
  { value: 'hiking', label: '轻户外徒步', subLabel: '自然小径/景深' },
];
const sceneText: Record<string, string> = {
  outdoor: '明亮自然的户外生活场景', street: '现代城市街道与自然日光', driving: '高级轿车的真实驾驶舱内，模特坐在驾驶位，方向盘、仪表台、车窗与座椅清晰可见',
  fishing: '安静湖畔钓鱼场景与柔和天光', climbing: '克制的山地轻户外场景', hiking: '山路徒步与晴朗自然光',
};
const sceneOutfit: Record<string, string> = {
  outdoor: '长袖轻量户外夹克、功能长裤和户外鞋', street: '剪裁利落的休闲西装外套、有领衬衫、长裤和皮鞋',
  driving: '有领长袖衬衫、轻薄驾驶夹克、长裤和便鞋', fishing: '长袖防晒衬衫、轻量钓鱼马甲、功能长裤和户外鞋',
  climbing: '长袖软壳外套、耐磨户外长裤和登山鞋', hiking: '长袖防风外套、徒步长裤和徒步鞋',
};
const genders = [{ value: 'female', label: '女性' }, { value: 'male', label: '男性' }];
const modelStyles = [
  { value: 'white', label: '白人', subLabel: '欧美高级脸' },
  { value: 'asian', label: '亚洲人', subLabel: '亚洲清透感' },
  { value: 'latino', label: '拉丁裔', subLabel: '拉丁热烈风' },
  { value: 'african', label: '非洲裔', subLabel: '酷炫深色调' },
];
const ages = [
  { value: '20–25 岁', label: '20–25 岁', subLabel: '青春潮酷' },
  { value: '25–30 岁', label: '25–30 岁', subLabel: '成熟干练' },
  { value: '30–35 岁', label: '30–35 岁', subLabel: '雅致高阶' },
];
const ratios = [
  { value: '3:4', label: '3:4', subLabel: '时尚海报' },
  { value: '1:1', label: '1:1', subLabel: '正方橱窗' },
  { value: '9:16', label: '9:16', subLabel: '手机全屏' },
  { value: '16:9', label: '16:9', subLabel: '横屏大片' },
];

const readAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

async function assetUrlToBlob(assetUrl: string): Promise<Blob> {
  const trimmed = String(assetUrl || '').trim();
  if (trimmed.startsWith('data:')) {
    const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    const base64 = trimmed.replace(/^data:[^;]+;base64,/i, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
  const response = await fetch(trimmed);
  if (!response.ok) {
    throw new Error(`failed to fetch generated asset: ${response.status}`);
  }
  return response.blob();
}

interface ImageStudioProps {
  onUseForVideo?: (asset: { name: string; dataUrl: string; url: string; kind?: string }) => void;
  platform?: any;
  costs?: Record<string, number>;
}

export default function ImageStudio({ onUseForVideo, platform, costs }: ImageStudioProps) {
  const [assets, setAssets] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [gender, setGender] = useState('male');
  const [scene, setScene] = useState('street');
  const [ratio, setRatio] = useState('3:4');
  const [modelStyle, setModelStyle] = useState('white');
  const [age, setAge] = useState('30–35 岁');
  const [framing, setFraming] = useState('半身');
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 999999)));
  const [prompt, setPrompt] = useState('');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [activeGeneration, setActiveGeneration] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const optionLabel = (items: Array<{ value: string; label: string }>, value: string) => items.find((item) => item.value === value)?.label || value;

  // buildPrompt migrated from cookshark墨镜-模特生成 — adds camera simulation (Canon EOS R5 + 85mm f/1.2),
  // skin realism hard rules, microexpression, depth/cinematic requirements.
  // Keeps the existing richer sceneText/sceneOutfit split (more specific than cookshark's sceneDescriptions).
  const defaultPrompt = useMemo(() => `请严格按照以下要求创作一张逼真的时尚广告图片，宽高比必须为 ${ratio}：
1.  **核心主体**: 一位时尚的${optionLabel(genders, gender)}模特，自信地佩戴所提供的太阳镜。
2.  **模特特征**:
    *   **年龄**: ${age}。
    *   **人种**: ${optionLabel(modelStyles, modelStyle)}。
    *   **真实感**: 必须具有极高的照片真实感。皮肤要细腻、健康且真实，仅保留尺度正确、均匀而轻微的毛孔、细小纹理和自然肤色过渡；面部主体保持干净平整，不要夸张毛孔、粗糙颗粒、痘印、油腻高光或过度锐化。同时严禁蜡像感、塑料感、磨皮滤镜感和过度平滑的人工痕迹。
    *   **微表情**: 模特的表情需要自然、放松，带有微妙的情绪流露（如一丝笑意、沉思的眼神），避免僵硬或不自然的姿势。
3.  **场景与光线**:
    *   **场景**: 在${sceneText[scene]}中。模特穿着${sceneOutfit[scene]}。
    *   **光线**: 模拟专业单反相机（如 Canon EOS R5 搭配 85mm f/1.2 镜头）的拍摄效果。光线必须符合逻辑且自然，能突出模特的特征和太阳镜的细节，营造出柔和的景深和电影感。
4.  **整体氛围**: 优雅、酷炫且令人向往。`, [ratio, gender, age, modelStyle, scene]);
  useEffect(() => setPrompt(defaultPrompt), [defaultPrompt]);
  useEffect(() => { if (scene === 'driving' && framing === '全身') setFraming('半身') }, [scene, framing]);

  const resolveImageCost = (): number => {
    const configured = Number(costs?.['image_gen'] ?? costs?.['IMAGE_GEN']);
    return Number.isFinite(configured) && configured > 0 ? configured : IMAGE_GEN_COST;
  };

  const ensureActionAllowed = (totalImages: number): boolean => {
    const amount = resolveImageCost() * totalImages;
    if (!Number.isFinite(amount) || amount <= 0) return true;
    if (platform?.checkBalance && !platform.checkBalance(amount)) {
      setError(`积分不足，需要 ${amount} 积分。`);
      platform.showRecharge?.();
      return false;
    }
    return true;
  };

  const persistGeneratedImage = async (imageDataUrl: string, index: number) => {
    const taskName = `${APP_ID} - AI模特试戴图-${index + 1}`;
    try {
      const blob = await assetUrlToBlob(imageDataUrl);
      const upload = await uploadAssetToCOSWithPresignedURL(blob, {
        fileName: `tryon-image-${Date.now()}-${index + 1}.png`,
        objectPath: `standalone/${APP_ID}/generated_images`,
        appID: APP_ID,
        camAppID: APP_ID,
      });

      const persistedURL = String(upload.url || '').trim() || String(upload.signed_url || '').trim() || String(upload.public_url || '').trim() || imageDataUrl;

      let objectRecord: Awaited<ReturnType<typeof recordTaskManagerObject>> | null = null;
      try {
        objectRecord = await recordTaskManagerObject({
          bucket_name: String(upload.bucket_name || '').trim(),
          region: String(upload.region || '').trim(),
          object_key: String(upload.object_key || '').trim(),
          url: persistedURL,
          size_bytes: blob.size,
          mime_type: blob.type || 'image/png',
        });
      } catch (err) {
        console.warn(`[${APP_ID}] image object record failed, continue task creation`, err);
      }

      try {
        await createTaskQueueItem({
          source_app_id: APP_ID,
          item_type: 'image_link',
          status: 'finished',
          payload: {
            title: taskName,
            name: taskName,
            image_url: persistedURL,
            url: persistedURL,
            object_id: objectRecord?.object_id,
            object_key: upload.object_key,
            bucket: upload.bucket_name,
            region: upload.region,
            mime_type: blob.type || 'image/png',
            size_bytes: blob.size,
            shot_index: index,
            aspect_ratio: ratio,
            framing,
            scene,
          },
        });
      } catch (err) {
        console.warn(`[${APP_ID}] image task persisted with minimal payload`, err);
      }
    } catch (err) {
      console.error(`[${APP_ID}] persistGeneratedImage failed for image ${index + 1}`, err);
    }
  };

  const addAssets = async (files: FileList) => {
    const valid = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 9 - assets.length);
    if (!valid.length) return;
    const next = await Promise.all(valid.map(async (file) => ({ name: file.name, dataUrl: await readAsDataUrl(file) })));
    setAssets((current) => [...current, ...next]);
    setError('');
  };

  const removeAsset = (index: number) => {
    setAssets((current) => current.filter((_, i) => i !== index));
  };

  const generate = async () => {
    if (!assets.length) { setError('请先上传至少一张眼镜产品参考图。'); return; }
    if (!ensureActionAllowed(2)) return;
    setLoading(true); setError('');
    try {
      const productImages = assets.map((asset) => asset.dataUrl);
      const seedNum = Number(seed);

      const [image1, image2] = await Promise.all([
        generateTryOnImage({ prompt, framing, scene, aspectRatio: ratio, productImages, seed: seedNum }),
        generateTryOnImage({ prompt, framing, scene, aspectRatio: ratio, productImages, seed: seedNum + 1 }),
      ]);

      const images = [image1, image2].slice(0, 2);
      if (images.length !== 2) throw new Error('本次未完整返回两张图片，请重试');

      void platform?.refreshCredits?.();

      setGenerations((current) => [{ id: `${Date.now()}-${seed}`, images, scene, ratio, framing }, ...current]);
      setActiveGeneration(0);

      // Persist both images to task queue (non-blocking)
      void persistGeneratedImage(image1, 0);
      void persistGeneratedImage(image2, 1);
    } catch (err) {
      setError(String((err as Error)?.message || '图片生成失败'));
    } finally {
      setLoading(false);
    }
  };

  const useSelectedForVideo = (imageUrl: string) => {
    if (imageUrl) onUseForVideo?.({ name: `AI 模特试戴图.png`, dataUrl: imageUrl, url: imageUrl, kind: 'model-reference' });
  };

  const downloadAll = (images: string[]) => {
    images.slice(0, 2).forEach((image, index) => {
      const link = document.createElement('a');
      link.href = image;
      link.download = `eyewear-fitting-${generations[activeGeneration]?.id || 'result'}-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  };

  const totalImageCost = resolveImageCost() * 2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      {/* Left Column: Controls Panel */}
      <div className="image-control-card lg:col-span-2 bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800/80 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 sm:p-6 space-y-6">
          {/* Step 1: Upload */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/40">
                1
              </span>
              <h2 className="text-sm font-bold text-zinc-100 tracking-tight">上传墨镜产品参考图</h2>
            </div>
            <ImageUploader
              assets={assets}
              onAdd={addAssets}
              onRemove={removeAsset}
              isLoading={loading}
              maxAssets={9}
            />
          </div>

          {/* Step 2: Customization */}
          <div className="transition-all duration-300">
            <div className="flex items-center space-x-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center border border-amber-500/40">
                2
              </span>
              <h2 className="text-sm font-bold text-zinc-100 tracking-tight">定制模特试戴与光影场景</h2>
            </div>
            <OptionsSelector
              gender={gender} setGender={setGender}
              scene={scene} setScene={setScene}
              ratio={ratio} setRatio={setRatio}
              framing={framing} setFraming={setFraming}
              modelStyle={modelStyle} setModelStyle={setModelStyle}
              age={age} setAge={setAge}
              seed={seed} setSeed={setSeed}
              prompt={prompt} setPrompt={setPrompt}
              onResetPrompt={() => setPrompt(defaultPrompt)}
              disabled={loading}
            />
          </div>
        </div>

        {/* Fixed Generate Button */}
        <div className="p-5 sm:p-6 mt-auto border-t border-zinc-800 bg-zinc-950/60">
          <button
            type="button"
            onClick={generate}
            disabled={!assets.length || loading}
            className="w-full flex items-center justify-center bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black py-3.5 px-5 rounded-2xl transition-all duration-300 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-sm uppercase tracking-wider shadow-xl shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Spinner />
                <span className="ml-2.5 text-zinc-900 font-bold">正在生成两张试戴图…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2 text-black" />
                <span>生成 AI 模特试戴图</span>
                <small className="ml-2 text-[10px] font-medium opacity-80 normal-case tracking-normal">{totalImageCost} 积分 · 2 张</small>
              </>
            )}
          </button>
          {error && (
            <div className="mt-3 text-xs text-rose-300 bg-rose-950/20 border border-rose-900/40 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Results Display Area */}
      <div className="image-preview-card lg:col-span-3 lg:sticky lg:top-20">
        <GeneratedImageDisplay
          generations={generations}
          activeGenerationIndex={activeGeneration}
          setActiveGenerationIndex={setActiveGeneration}
          isLoading={loading}
          error={error || null}
          ratio={ratio}
          onUseSelectedForVideo={useSelectedForVideo}
          onDownloadAll={downloadAll}
        />
      </div>
    </div>
  );
}
