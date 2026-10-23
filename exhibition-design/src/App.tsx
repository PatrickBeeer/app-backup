import {
  Aperture, ArrowDownToLine, Check, ChevronRight, ImagePlus,
  Layers3, LoaderCircle, Maximize2, Plus, Upload,
  WandSparkles, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { COSTS, categoryReferenceUrls } from './constants';
import {
  checkBalance,
  fetchCreditBalance,
  getCachedCredits,
  isInsufficientCreditsMessage,
  showRecharge,
} from './platform';
import {
  fileToInlineImage,
  generateImage,
  urlToInlineImage,
  type BillingTask,
  type InlineImage,
} from './services/generationService';

const categoryGroups = [
  { label: '项目类型', items: ['品牌', '打卡', '校园'] },
  { label: '节庆主题', items: ['春节', '中秋', '端午'] },
];
const styleGroups = [
  { label: '东方节庆', items: ['新中式', '国潮喜庆', '东方雅致'] },
  { label: '现代商业', items: ['品牌定制', '现代轻奢'] },
  { label: '自然清新', items: ['自然花艺', '清新校园', '户外活力'] },
  { label: '童趣潮流', items: ['童趣卡通', '多巴胺潮流', 'IP互动'] },
];
const categoryPrompts: Record<string, string> = {
  品牌: '突出品牌标识、产品资产与统一视觉规范，兼顾传播识别度和现场体验',
  打卡: '设置清晰的取景框、互动动作与拍照站位，形成强记忆点的打卡装置',
  春节: '融入春节祝福、灯笼、瑞兽与团圆意象，营造热烈但不过度拥挤的年节氛围',
  校园: '围绕开学、毕业或青春成长语义，设置适合师生合影与留言的互动区域',
  端午: '融入粽子、龙舟、艾草与水纹等端午意象，兼顾传统文化和年轻表达',
  中秋: '融入圆月、玉兔、桂花与山水云纹等中秋意象，突出团圆与雅致氛围',
};
const stylePrompts: Record<string, string> = {
  新中式: '现代比例结合中式框景、留白、山水与精致线条',
  国潮喜庆: '高识别度传统符号、饱满层次和热烈节庆配色',
  东方雅致: '极简、雅致、克制的中式审美，以现代比例、简洁线条、大面积留白和少量东方材质表达意境，不使用祥云、复杂纹样或符号堆砌',
  品牌定制: '严格使用用户上传的品牌 LOGO 和品牌色，统一装置、字体、材质与传播画面的品牌识别',
  现代轻奢: '金属质感、通透亚克力、简洁几何与精致灯光',
  自然花艺: '以丰富的花艺造型为画面主体，组合花墙、花拱门、花柱、花丛和悬垂花艺等多种形态，层次饱满、自然生长、疏密有致，保留真实花材质感',
  清新校园: '首先突出用户选定的校园主题和主标题，使用鲜明、清爽、干净的配色，结合简洁的青春校园元素，画面有活力但不杂乱',
  户外活力: '适应草坪与广场的鲜明大色块、轻运动感和耐候结构',
  童趣卡通: '圆润造型、友好卡通角色、清晰轮廓和亲子互动尺度',
  多巴胺潮流: '高饱和撞色、年轻字体、活泼几何和社交媒体视觉语言',
  'IP互动': '围绕主IP角色设计可进入、可触发、可合影的叙事场景',
};
const industries = ['商业美陈', '市集活动', '商场节庆', '文旅打卡', '品牌快闪', '婚礼庆典', '升学宴'];
const environments = ['户外', '室内', '商场中庭', '展会场馆'];
const colorModes = ['主题智能配色', '自定义', '品牌色', '低饱和自然色', '高饱和撞色'];
const ratios = [
  ['1:1', 'aspect-square'], ['3:2', 'aspect-[3/2]'], ['4:3', 'aspect-[4/3]'],
  ['16:9', 'aspect-video'], ['21:9', 'aspect-[21/9]'], ['3:4', 'aspect-[3/4]'],
  ['2:3', 'aspect-[2/3]'], ['9:16', 'aspect-[9/16]'],
];
type Resolution = '1K' | '2K';
const resolutions: Resolution[] = ['1K', '2K'];
const imageSizes: Record<Resolution, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024', '3:2': '1536x1024', '4:3': '1536x1024',
    '16:9': '1536x1024', '21:9': '1536x1024', '3:4': '1024x1536',
    '2:3': '1024x1536', '9:16': '1024x1536',
  },
  '2K': {
    '1:1': '2048x2048', '3:2': '2048x1152', '4:3': '2048x1152',
    '16:9': '2048x1152', '21:9': '2048x1152', '3:4': '1152x2048',
    '2:3': '1152x2048', '9:16': '1152x2048',
  },
};
const MAX_REFERENCES = 10;
const DEFAULT_IMAGE_URL = '/standalone/exhibition-design/spring-festival.png';

type PreviewFile = { name: string; url: string; file: File };
type ReferenceItem = {
  id: string;
  name: string;
  url: string;
  file?: File;
  remoteUrl?: string;
};

async function createWorkflowImage(source: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    if (/^https?:/i.test(source)) nextImage.crossOrigin = 'anonymous';
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('无法读取当前方案图片'));
    nextImage.src = source;
  });
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理当前图片');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('图片压缩失败，请重试');
  return new File([blob], 'design-source.jpg', { type: 'image/jpeg' });
}

async function downloadImage(source: string, filename: string) {
  try {
    const blob = await (await fetch(source)).blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    window.open(source, '_blank');
  }
}

function UploadTile({ preview, onClick, onRemove, title = '上传实景场地图', hint = 'JPG / PNG / WEBP，建议正视广角', alt = '已上传的场地图' }: { preview?: string; onClick: () => void; onRemove: () => void; title?: string; hint?: string; alt?: string }) {
  return (
    <div className="relative">
      <button type="button" onClick={onClick} className="upload-tile group relative flex min-h-32 w-full items-center justify-center overflow-hidden text-left">
        {preview ? <>
          <img src={preview} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/25 transition group-hover:bg-black/40" />
          <span className="relative flex items-center gap-2 rounded-md bg-black/55 px-3 py-2 text-xs font-medium text-white backdrop-blur"><Upload className="size-3.5" />更换图片</span>
        </> : <span className="flex items-center gap-3 px-4 py-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#efe8df] text-[#a5543c] transition group-hover:bg-[#a5543c] group-hover:text-white"><ImagePlus className="size-4" /></span>
          <span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-5 text-[#7a746d]">{hint}</span></span>
        </span>}
      </button>
      {preview && <button type="button" aria-label="移除实景场地图" onClick={onRemove} className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-sm transition hover:bg-[#a5543c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="size-4" /></button>}
    </div>
  );
}

export default function App() {
  const sceneInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const brandLogoInput = useRef<HTMLInputElement>(null);
  const [scene, setScene] = useState<PreviewFile | null>(null);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [brandLogo, setBrandLogo] = useState<PreviewFile | null>(null);
  const [brandColors, setBrandColors] = useState('');
  const [category, setCategory] = useState('春节');
  const [style, setStyle] = useState('新中式');
  const [industry, setIndustry] = useState('商业美陈');
  const [placementEnvironment, setPlacementEnvironment] = useState('户外');
  const [colorMode, setColorMode] = useState('主题智能配色');
  const [customPalette, setCustomPalette] = useState('');
  const [mainTitle, setMainTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ratio, setRatio] = useState('16:9');
  const [resolution, setResolution] = useState<Resolution>('2K');
  const [spaceType, setSpaceType] = useState('商业街区');
  const [generateCount, setGenerateCount] = useState('1');
  const [description, setDescription] = useState('设计一组可进入拍照的主题美陈。主视觉包含层次分明的主体装置、镂空取景框与互动节点，并保留现场主要动线。');
  const [strength, setStrength] = useState(72);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([DEFAULT_IMAGE_URL]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState('');
  const [designConfirmed, setDesignConfirmed] = useState(false);
  const [flatImage, setFlatImage] = useState<string | null>(null);
  const [splitImage, setSplitImage] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState<'flat' | 'split' | null>(null);
  const [workflowError, setWorkflowError] = useState('');
  const [credits, setCredits] = useState(getCachedCredits());

  const presetItems = useMemo(
    () => categoryReferenceUrls(category).map((url, index) => ({
      url,
      name: `${category}案例 ${String(index + 1).padStart(2, '0')}`,
    })),
    [category],
  );

  useEffect(() => {
    let cancelled = false;
    fetchCreditBalance()
      .then((value) => { if (!cancelled) setCredits(value); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function refreshCredits() {
    fetchCreditBalance()
      .then(setCredits)
      .catch(() => {});
  }

  function pickScene(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    if (scene) URL.revokeObjectURL(scene.url);
    setScene({ name: file.name, url: URL.createObjectURL(file), file });
  }
  function removeScene() {
    if (scene) URL.revokeObjectURL(scene.url);
    setScene(null);
    if (sceneInput.current) sceneInput.current.value = '';
  }
  function pickReferences(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, MAX_REFERENCES - references.length)
      .map((f) => ({ id: `${Date.now()}-${f.name}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, url: URL.createObjectURL(f), file: f } as ReferenceItem));
    setReferences((current) => [...current, ...next]);
  }
  function removeReference(index: number) {
    const item = references[index];
    if (item.file) URL.revokeObjectURL(item.url);
    setReferences((current) => current.filter((_, i) => i !== index));
  }
  function togglePreset(url: string, name: string) {
    setReferences((current) => {
      const existing = current.find((item) => item.remoteUrl === url);
      if (existing) return current.filter((item) => item.remoteUrl !== url);
      if (current.length >= MAX_REFERENCES) return current;
      return [...current, { id: `preset-${url}`, name, url, remoteUrl: url }];
    });
  }
  function pickBrandLogo(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    if (brandLogo) URL.revokeObjectURL(brandLogo.url);
    setBrandLogo({ name: file.name, url: URL.createObjectURL(file), file });
  }
  function removeBrandLogo() {
    if (brandLogo) URL.revokeObjectURL(brandLogo.url);
    setBrandLogo(null);
    if (brandLogoInput.current) brandLogoInput.current.value = '';
  }
  function resetProductionWorkflow() {
    setDesignConfirmed(false);
    setFlatImage(null);
    setSplitImage(null);
    setWorkflowError('');
  }
  function selectGeneratedImage(index: number) {
    if (index >= generatedImages.length) return;
    setSelectedImage(index);
    resetProductionWorkflow();
  }
  async function referenceToInlineImage(item: ReferenceItem): Promise<InlineImage> {
    if (item.file) return fileToInlineImage(item.file);
    if (item.remoteUrl) return urlToInlineImage(item.remoteUrl);
    throw new Error('参考图数据缺失，请重新添加');
  }
  async function generateFromImage(source: string, prompt: string, size: string, billingTask: BillingTask) {
    const sourceFile = await createWorkflowImage(source);
    return generateImage({
      prompt,
      images: [await fileToInlineImage(sourceFile)],
      size,
      billingTask,
    });
  }
  function confirmDesign() {
    if (!generatedImages[selectedImage]) return;
    resetProductionWorkflow();
    setDesignConfirmed(true);
  }
  async function generateFlatArtwork() {
    const source = generatedImages[selectedImage];
    if (!designConfirmed || !source) return;
    if (!checkBalance(COSTS.flat_conversion)) {
      setWorkflowError(`积分不足，生成平面图需要 ${COSTS.flat_conversion} 积分`);
      showRecharge();
      return;
    }
    setWorkflowBusy('flat');
    setWorkflowError('');
    try {
      const result = await generateFromImage(source, '将这张已确认的美陈效果图转换为正视角二维平面设计稿。完整保留主体装置的造型、构图、色彩、文案和装饰元素，去除环境、人物、透视、灯光、阴影和地面。主体居中，结构边缘清晰，画面留白充足，中间拍照区域保持通透，纯白背景，高清平面插画效果，适合后续制作拆解；不要新增元素，不要修改原有文字。', imageSizes[resolution][ratio], 'flat_conversion');
      setFlatImage(result);
      setSplitImage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '平面图生成失败';
      setWorkflowError(message);
      if (isInsufficientCreditsMessage(message)) showRecharge();
    } finally {
      setWorkflowBusy(null);
      refreshCredits();
    }
  }
  async function splitArtwork() {
    if (!flatImage) return;
    if (!checkBalance(COSTS.element_split)) {
      setWorkflowError(`积分不足，美陈拆解需要 ${COSTS.element_split} 积分`);
      showRecharge();
      return;
    }
    setWorkflowBusy('split');
    setWorkflowError('');
    try {
      const result = await generateFromImage(flatImage, '将输入的美陈平面设计稿拆解成独立元素素材板。每个元素必须完整分离、互不重叠、四周留白，并按照视觉层级整齐排列在纯白背景上。拆出主标题文字、边框结构、装饰图形、花朵、气球、建筑、植物和符号等所有组成部分；保持原色、原造型和原文案，正视二维平面，无透视、无阴影、无场景背景，边缘清晰，便于后续制作应用。', imageSizes[resolution]['16:9'], 'element_split');
      setSplitImage(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '元素拆解失败';
      setWorkflowError(message);
      if (isInsufficientCreditsMessage(message)) showRecharge();
    } finally {
      setWorkflowBusy(null);
      refreshCredits();
    }
  }
  async function generate() {
    if (!scene) {
      setGenerationError('请先上传实景场地图');
      return;
    }
    if (style === '品牌定制' && !brandColors.trim()) {
      setGenerationError('请先填写品牌色');
      return;
    }
    if (style === '品牌定制' && !brandLogo) {
      setGenerationError('请先上传品牌 LOGO');
      return;
    }

    const count = Number(generateCount);
    const totalCost = COSTS.main_render * count;
    if (!checkBalance(totalCost)) {
      setGenerationError(`积分不足，生成 ${count} 张效果图需要 ${totalCost} 积分`);
      showRecharge();
      return;
    }

    const palettePrompt = style === '品牌定制' ? `品牌色：${brandColors.trim()}` : colorMode === '自定义' && customPalette.trim() ? customPalette.trim() : colorMode;
    const titlePrompt = [mainTitle.trim() && `主标题“${mainTitle.trim()}”`, subtitle.trim() && `副标题“${subtitle.trim()}”`].filter(Boolean).join('，');
    const brandPrompt = style === '品牌定制' ? `第二张上传图片是品牌标准 LOGO，必须保持其字形、图形、比例和色彩准确，不得改字、变形或重绘；全画面严格使用品牌色 ${brandColors.trim()}。` : '';
    const prompt = `${resolution}超写实${spaceType}${category}类美陈效果图，${style}风格，用于${industry}，放置环境为${placementEnvironment}，配色方案为${palettePrompt}。分类特征：${categoryPrompts[category]}。风格特征：${stylePrompts[style]}。${brandPrompt}${titlePrompt ? `${titlePrompt}，文字需要清晰准确、层级分明。` : ''}${description} 主体采用层次清晰的立体装置与打卡取景结构，结合可落地的玻璃钢烤漆、金属框架与半透亚克力材质；严格贴合实景场地透视与尺度，保留出入口及人行动线。参考图影响强度${strength}%。日间自然光，材质细腻，真实接触阴影，28mm广角镜头，1.5米人眼视角，建筑可视化渲染，${ratio}构图，画面干净完整，无多余杂物。`;
    setGenerating(true);
    setGenerationError('');
    setGenerationProgress(0);

    try {
      // Prepare all inputs before the billed loop so reference failures
      // (e.g. unreachable case images) never consume credits.
      const sceneImage = await fileToInlineImage(scene.file);
      const logoImage = style === '品牌定制' && brandLogo ? await fileToInlineImage(brandLogo.file) : null;
      const referenceImages = await Promise.all(references.map(referenceToInlineImage));

      const images: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const image = await generateImage({
          prompt: `${prompt} 生成方案 ${index + 1}，在整体主题一致的前提下调整装置层次与细节。`,
          images: [sceneImage, ...(logoImage ? [logoImage] : []), ...referenceImages],
          size: imageSizes[resolution][ratio],
          billingTask: 'main_render',
        });
        images.push(image);
        setGenerationProgress(index + 1);
      }
      setGeneratedImages(images);
      setSelectedImage(0);
      resetProductionWorkflow();
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败，请稍后重试';
      setGenerationError(message);
      if (isInsufficientCreditsMessage(message)) showRecharge();
    } finally {
      setGenerating(false);
      refreshCredits();
    }
  }

  const referencesFull = references.length >= MAX_REFERENCES;

  return (
    <main className="min-h-screen bg-[#f2efe9] text-[#272421]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/8 bg-[#f7f4ee]/90 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-[#a5543c] text-white"><Aperture className="size-5" /></div>
          <div><p className="font-serif text-lg font-semibold leading-none">美陈设计工作台</p><p className="mt-1 text-[10px] tracking-[.12em] text-[#8a8178]">AI 效果图生成</p></div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-[#766e66] sm:flex"><span className="status-dot" />积分余额 <span className="font-medium text-[#39342f]">{credits}</span><span className="mx-2 h-4 w-px bg-black/10" />{category}类美陈 · 草案 01</div>
        <Button variant="outline" size="sm" className="border-black/10 bg-white/65">我的项目<ChevronRight data-icon="inline-end" /></Button>
      </header>

      <div className="mx-auto grid max-w-[1720px] grid-cols-1 xl:grid-cols-[390px_minmax(500px,1fr)]">
        <aside className="border-b border-black/8 bg-[#f8f5ef] xl:min-h-[calc(100vh-64px)] xl:border-b-0 xl:border-r">
          <div className="border-b border-black/8 px-5 py-5"><div className="flex items-center justify-between"><div><p className="section-kicker">01 / 创作输入</p><h1 className="mt-1 font-serif text-2xl font-semibold">构建设计任务</h1></div><Badge variant="outline" className="border-[#a5543c]/25 bg-[#a5543c]/6 text-[#8f4430]">专业模式</Badge></div></div>
          <div className="space-y-7 px-5 py-6">
            <section>
              <div className="mb-3 flex items-end justify-between"><div><p className="field-label">实景场地图</p><p className="field-hint">用于锁定空间、透视和动线</p></div><span className="text-[11px] text-[#958d84]">必填 · 1 张</span></div>
              <input ref={sceneInput} type="file" accept="image/*" hidden onChange={(e) => pickScene(e.target.files)} />
              <UploadTile preview={scene?.url} onClick={() => sceneInput.current?.click()} onRemove={removeScene} />
            </section>
            <section>
              <div className="mb-3 flex items-end justify-between"><div><p className="field-label">风格参考图</p><p className="field-hint">混合造型、材质与色彩参考</p></div><span className="text-[11px] text-[#958d84]">{references.length} / {MAX_REFERENCES}</span></div>
              <input ref={refInput} type="file" accept="image/*" multiple hidden onChange={(e) => pickReferences(e.target.files)} />
              <div className="grid grid-cols-4 gap-2">
                {references.map((item, index) => <div key={item.id} className="group relative aspect-square overflow-hidden border border-black/10 bg-white">
                  <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                  <button type="button" aria-label={`移除参考图 ${item.name}`} onClick={() => removeReference(index)} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"><X className="size-3" /></button>
                </div>)}
                {references.length < MAX_REFERENCES && <button type="button" onClick={() => refInput.current?.click()} className="grid aspect-square place-items-center border border-dashed border-[#a49b91] bg-white/50 text-[#80776f] hover:border-[#a5543c] hover:text-[#a5543c]" aria-label="添加参考图"><span className="flex flex-col items-center gap-1 text-[10px]"><Plus className="size-4" />添加</span></button>}
              </div>
            </section>
            <label className="block"><span className="field-label mb-2 block">项目场景</span><NativeSelect value={spaceType} onChange={(e) => setSpaceType(e.target.value)} className="w-full">{['商业街区', '购物中心', '户外广场', '公园草坪', '展会场馆', '社区空间'].map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
            <section>
              <div><p className="field-label">案例分类</p><p className="field-hint">按案例包中的目录整理</p></div>
              <div className="mt-3 space-y-3">{categoryGroups.map((group) => <div key={group.label} className="grid grid-cols-[60px_1fr] gap-2"><span className="pt-1.5 text-[11px] text-[#8a8178]">{group.label}</span><div className="flex flex-wrap gap-2">{group.items.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`choice-chip ${category === item ? 'is-active' : ''}`}>{category === item && <Check className="size-3" />}{item}</button>)}</div></div>)}</div>
            </section>
            <section>
              <div className="mb-3 flex items-end justify-between"><div><p className="field-label">案例参考图</p><p className="field-hint">点击选用当前分类案例包中的参考图</p></div><span className="text-[11px] text-[#958d84]">{presetItems.length} 张</span></div>
              <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1">
                {presetItems.map((item, index) => {
                  const selected = references.some((reference) => reference.remoteUrl === item.url);
                  const disabled = !selected && referencesFull;
                  return (
                    <button key={item.url} type="button" aria-pressed={selected} aria-label={`${item.name} ${selected ? '移除' : '添加'}`} disabled={disabled} onClick={() => togglePreset(item.url, item.name)} className={`relative aspect-square overflow-hidden border bg-white transition ${selected ? 'border-[#a5543c] ring-1 ring-[#a5543c]' : 'border-black/10 hover:border-[#a5543c]/50'} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
                      <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                      {selected && <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-[#a5543c] text-white shadow"><Check className="size-3" /></span>}
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] text-white">{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <div><p className="field-label">视觉风格</p><p className="field-hint">根据案例造型、配色与氛围归纳</p></div>
              <div className="mt-3 space-y-3">{styleGroups.map((group) => <div key={group.label} className="grid grid-cols-[60px_1fr] gap-2"><span className="pt-1.5 text-[11px] text-[#8a8178]">{group.label}</span><div className="flex flex-wrap gap-2">{group.items.map((item) => <button key={item} type="button" onClick={() => setStyle(item)} className={`choice-chip ${style === item ? 'is-active' : ''}`}>{style === item && <Check className="size-3" />}{item}</button>)}</div></div>)}</div>
            </section>
            {style === '品牌定制' && <section className="border border-[#a5543c]/20 bg-[#a5543c]/5 p-4">
              <div><p className="section-kicker">品牌资产</p><p className="mt-1 text-sm font-semibold">上传品牌色与 LOGO</p><p className="field-hint">两项均会用于约束生成结果</p></div>
              <label htmlFor="brand-colors" className="mt-4 block"><span className="field-label mb-2 block">品牌色 <span className="text-[#a5543c]">*</span></span><Input id="brand-colors" value={brandColors} onChange={(e) => setBrandColors(e.target.value)} placeholder="例如：#C8161D、#FFFFFF，或红色+金色" className="border-black/10 bg-white/80" /><span className="field-hint block">可填写多个 HEX 色值或颜色名称</span></label>
              <div className="mt-4"><label htmlFor="brand-logo" className="field-label mb-2 block">品牌 LOGO <span className="text-[#a5543c]">*</span></label><input id="brand-logo" ref={brandLogoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickBrandLogo(e.target.files)} /><UploadTile preview={brandLogo?.url} onClick={() => brandLogoInput.current?.click()} onRemove={removeBrandLogo} title="上传品牌 LOGO" hint="PNG / JPG / WEBP，建议透明底 PNG" alt="已上传的品牌 LOGO" /></div>
            </section>}
            <section className="border border-black/8 bg-white/40 p-4">
              <div><p className="section-kicker">版面信息</p><p className="mt-1 text-sm font-semibold">补充画面用途与文字</p></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {style !== '品牌定制' && <label className="block"><span className="field-label mb-2 block">配色方案</span><NativeSelect value={colorMode} onChange={(e) => setColorMode(e.target.value)} className="w-full bg-white/70">{colorModes.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>}
                <label className="block"><span className="field-label mb-2 block">行业用途</span><NativeSelect value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full bg-white/70">{industries.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label className="block col-span-2"><span className="field-label mb-2 block">放置环境</span><NativeSelect value={placementEnvironment} onChange={(e) => setPlacementEnvironment(e.target.value)} className="w-full bg-white/70">{environments.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
              </div>
              {style !== '品牌定制' && colorMode === '自定义' && <label className="mt-3 block"><span className="field-label mb-2 block">自定义配色</span><Input value={customPalette} onChange={(e) => setCustomPalette(e.target.value)} placeholder="例如：绿色、米白色、暖黄色" className="border-black/10 bg-white/70" /></label>}
              <div className="mt-3 grid gap-3">
                <label className="block"><span className="field-label mb-2 block">主标题</span><Input value={mainTitle} onChange={(e) => setMainTitle(e.target.value)} placeholder="例如：藏在公园里的市集" className="border-black/10 bg-white/70" /></label>
                <label className="block"><span className="field-label mb-2 block">副标题</span><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="例如：邂逅美好，探索自然" className="border-black/10 bg-white/70" /></label>
              </div>
            </section>
            <label className="block"><span className="field-label">设计描述</span><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-3 min-h-28 resize-none border-black/10 bg-white/65 leading-6 focus-visible:border-[#a5543c] focus-visible:ring-[#a5543c]/15" /></label>
            <section><div className="mb-3 flex items-center justify-between"><p className="field-label">参考图影响强度</p><span className="font-mono text-xs text-[#a5543c]">{strength}%</span></div><input aria-label="参考图影响强度" type="range" min="0" max="100" value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="accent-range w-full" /><div className="mt-1 flex justify-between text-[10px] text-[#999087]"><span>更自由</span><span>更贴近参考</span></div></section>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 sm:py-6 xl:min-h-[calc(100vh-64px)]">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">02 / 效果预览</p><h2 className="mt-1 font-serif text-2xl font-semibold">空间渲染画布</h2></div><div className="flex items-center gap-2"><Badge variant="outline" className="border-emerald-900/15 bg-emerald-800/7 text-emerald-800"><span className="mr-1 size-1.5 rounded-full bg-emerald-600" />提示词已优化</Badge><Button variant="outline" size="icon" className="border-black/10 bg-white/65" aria-label="放大预览"><Maximize2 /></Button></div></div>
          <div className="canvas-shell mt-5"><div className="canvas-grid" />
            {generating ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#e7e2d9]/85 backdrop-blur-sm"><div className="text-center"><LoaderCircle className="mx-auto size-8 animate-spin text-[#a5543c]" /><p className="mt-4 font-serif text-xl font-semibold">正在搭建空间层次</p><p className="mt-1 text-xs text-[#766e66]">正在生成第 {Math.min(generationProgress + 1, Number(generateCount))} / {generateCount} 张</p></div></div>
            : generatedImages.length > 0 ? <div className="absolute inset-0"><img src={generatedImages[selectedImage]} alt={`美陈效果渲染方案 ${selectedImage + 1}`} className="h-full w-full object-contain" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 via-black/15 to-transparent px-5 pb-5 pt-20 text-white"><div><div className="flex items-center gap-2 text-[11px] text-white/75"><span>方案 {String(selectedImage + 1).padStart(2, '0')}</span><span className="h-3 w-px bg-white/35" /><span>{ratio}</span><span className="h-3 w-px bg-white/35" /><span>{resolution} · 高质量</span></div><p className="mt-1 font-serif text-lg font-semibold">{category} · {style}美陈方案</p></div><button type="button" onClick={() => downloadImage(generatedImages[selectedImage], `${category}美陈效果图-${selectedImage + 1}.png`)} className="grid size-9 place-items-center rounded-full bg-white text-[#2b2724] transition hover:scale-105" aria-label="下载效果图"><ArrowDownToLine className="size-4" /></button></div></div>
            : <div className="absolute inset-0 grid place-items-center"><div className="max-w-sm text-center"><Layers3 className="mx-auto size-8 text-[#a5543c]" /><p className="mt-4 font-serif text-xl font-semibold">等待生成设计方案</p><p className="mt-2 text-sm leading-6 text-[#766e66]">上传场地图并完成左侧设定，效果渲染图将在这里呈现。</p></div></div>}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">{Array.from({ length: Number(generateCount) }, (_, item) => <button key={item} type="button" onClick={() => selectGeneratedImage(item)} className={`relative aspect-video overflow-hidden border bg-[#ded8ce] ${item === selectedImage && item < generatedImages.length ? 'border-[#a5543c] ring-1 ring-[#a5543c]' : 'border-black/10'}`}>{item < generatedImages.length ? <img src={generatedImages[item]} alt={`方案 ${item + 1} 缩略图`} className="h-full w-full object-contain" /> : <span className="absolute inset-0 grid place-items-center text-[10px] text-[#958d84]">方案 {String(item + 1).padStart(2, '0')}</span>}</button>)}</div>
          <div className="mt-6 border-t border-black/8 pt-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="field-label">出图比例</p><div className="mt-3 flex flex-wrap gap-2">{ratios.map(([label, shape]) => <button key={label} type="button" aria-pressed={ratio === label} onClick={() => setRatio(label)} className={`ratio-chip ${ratio === label ? 'is-active' : ''}`}><span className={`ratio-shape ${shape}`} />{label}</button>)}</div></div><div className="flex flex-wrap items-end gap-2"><div><p className="field-label mb-2">输出分辨率</p><div className="flex h-11 items-center gap-2">{resolutions.map((item) => <button key={item} type="button" aria-pressed={resolution === item} onClick={() => setResolution(item)} className={`ratio-chip h-11 min-w-14 justify-center text-xs ${resolution === item ? 'is-active' : ''}`}>{item}</button>)}</div></div><label><span className="field-label mb-2 block">生成张数</span><NativeSelect value={generateCount} onChange={(e) => setGenerateCount(e.target.value)} className="h-11 min-w-24 bg-white/65">{['1', '2', '3', '4'].map((count) => <NativeSelectOption key={count} value={count}>{count} 张</NativeSelectOption>)}</NativeSelect></label><Button onClick={generate} disabled={generating} size="lg" className="h-11 bg-[#a5543c] px-5 text-white shadow-[0_12px_30px_rgb(165_84_60/.22)] hover:bg-[#8f4430]">{generating ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}{generating ? `生成中 ${generationProgress}/${generateCount}` : `生成效果图（${COSTS.main_render}积分/张）`}</Button><Button onClick={confirmDesign} disabled={generating || generatedImages.length === 0} variant="outline" size="lg" className={`h-11 px-5 ${designConfirmed ? 'border-emerald-700/30 bg-emerald-700/10 text-emerald-800' : 'border-black/10 bg-white/65'}`}><Check />{designConfirmed ? '方案已确认' : '确认方案'}</Button><Button onClick={() => downloadImage(generatedImages[selectedImage], `${category}美陈效果图-${selectedImage + 1}.png`)} disabled={generatedImages.length === 0} variant="outline" size="lg" className="h-11 border-black/10 bg-white/65 px-5"><ArrowDownToLine />下载图片</Button></div></div>{generationError && <p className="mt-3 text-right text-sm text-red-700" role="alert">{generationError}</p>}</div>

          {designConfirmed && <section className="mt-8 border-t border-black/8 pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">03 / 方案深化</p><h2 className="mt-1 font-serif text-2xl font-semibold">平面生产流程</h2></div><Badge variant="outline" className="border-emerald-900/15 bg-emerald-800/7 text-emerald-800"><Check className="mr-1 size-3" />当前方案已锁定</Badge></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <article className="flex min-h-72 flex-col border border-black/8 bg-white/55 p-3">
                <div className="relative aspect-video overflow-hidden bg-[#e7e2d9]">{flatImage ? <><img src={flatImage} alt="生成的美陈平面图" className="h-full w-full object-contain" /><button type="button" onClick={() => downloadImage(flatImage, `${category}美陈平面图.png`)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-[#2b2724] shadow transition hover:scale-105" aria-label="下载平面图"><ArrowDownToLine className="size-4" /></button></> : <div className="absolute inset-0 grid place-items-center text-center text-[#867e76]"><div><ImagePlus className="mx-auto size-6" /><p className="mt-2 text-xs">等待生成平面图</p></div></div>}{workflowBusy === 'flat' && <div className="absolute inset-0 grid place-items-center bg-white/75"><LoaderCircle className="size-6 animate-spin text-[#a5543c]" /></div>}</div>
                <div className="flex flex-1 flex-col pt-4"><p className="font-serif text-lg font-semibold">01 · 生成平面图</p><p className="mt-1 text-xs leading-5 text-[#766e66]">把确认的空间效果转换为正视二维设计稿（{COSTS.flat_conversion}积分/次）。</p><div className="mt-auto flex gap-2 pt-3"><Button onClick={generateFlatArtwork} disabled={workflowBusy !== null} className="flex-1 bg-[#302b27] text-white hover:bg-black">{workflowBusy === 'flat' ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}{flatImage ? `重新生成平面图（${COSTS.flat_conversion}积分）` : `生成平面图（${COSTS.flat_conversion}积分）`}</Button><Button onClick={() => downloadImage(flatImage as string, `${category}美陈平面图.png`)} disabled={!flatImage} variant="outline" className="border-black/10 bg-white/65"><ArrowDownToLine />下载</Button></div></div>
              </article>
              <article className="flex min-h-72 flex-col border border-black/8 bg-white/55 p-3">
                <div className="relative aspect-video overflow-hidden bg-[#e7e2d9]">{splitImage ? <><img src={splitImage} alt="美陈元素拆解平面图" className="h-full w-full object-contain" /><button type="button" onClick={() => downloadImage(splitImage, `${category}美陈拆解素材板.png`)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-[#2b2724] shadow transition hover:scale-105" aria-label="下载拆解素材板"><ArrowDownToLine className="size-4" /></button></> : <div className="absolute inset-0 grid place-items-center text-center text-[#867e76]"><div><Layers3 className="mx-auto size-6" /><p className="mt-2 text-xs">等待元素拆解</p></div></div>}{workflowBusy === 'split' && <div className="absolute inset-0 grid place-items-center bg-white/75"><LoaderCircle className="size-6 animate-spin text-[#a5543c]" /></div>}</div>
                <div className="flex flex-1 flex-col pt-4"><p className="font-serif text-lg font-semibold">02 · 美陈拆解</p><p className="mt-1 text-xs leading-5 text-[#766e66]">将文字、结构与装饰元素分开排列成素材板（{COSTS.element_split}积分/次）。</p><div className="mt-auto flex gap-2 pt-3"><Button onClick={splitArtwork} disabled={!flatImage || workflowBusy !== null} className="flex-1 bg-[#a5543c] text-white hover:bg-[#8f4430]">{workflowBusy === 'split' ? <LoaderCircle className="animate-spin" /> : <Layers3 />}{splitImage ? `重新美陈拆解（${COSTS.element_split}积分）` : `美陈拆解（${COSTS.element_split}积分）`}</Button><Button onClick={() => downloadImage(splitImage as string, `${category}美陈拆解素材板.png`)} disabled={!splitImage} variant="outline" className="border-black/10 bg-white/65"><ArrowDownToLine />下载</Button></div></div>
              </article>
            </div>
            {workflowError && <p className="mt-3 text-sm text-red-700" role="alert">{workflowError}</p>}
          </section>}
        </section>

      </div>
    </main>
  );
}
