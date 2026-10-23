import type {
  GenerationUnit,
  ProductBrief,
  Project,
  ReferenceTranscriptSegment,
  ScriptLine,
  Shot,
  SpeechSegment
} from './types.js';
import { resolvePresenterMode } from './presenter.js';

function linesForUnit(project: Project, unit: GenerationUnit): ScriptLine[] {
  return (project.analysis?.script ?? []).filter((line) => line.start < unit.end && line.end > unit.start);
}

export function buildUnitPrompt(project: Project, unit: GenerationUnit): string {
  const presenterMode = resolvePresenterMode(project);
  const dialogue = linesForUnit(project, unit)
    .map((line) => {
      const start = Math.max(0, line.start - unit.start).toFixed(3);
      const end = Math.min(unit.duration, line.end - unit.start).toFixed(3);
      return `- ${start}–${end} 秒，逐字说：“${line.text}”`;
    })
    .join('\n');
  const facts = [
    `商品名：${project.product.name}`,
    `价格信息：${project.product.price || '不展示价格'}`,
    `卖点：${project.product.sellingPoints.join('；')}`,
    `规格：${project.product.specifications.join('；')}`,
    `必须体现：${project.product.requiredClaims.join('；') || '无'}`,
    `严禁表达：${project.product.forbiddenClaims.join('；') || '无'}`
  ].join('\n');
  const presenterInstruction = presenterMode === 'reference'
    ? '不要沿用参考视频中的人物身份。人物身份必须严格使用前几张人物参考照片。'
    : '生成一位明确年满 18 岁、与新商品定位相符的带货人物；不得沿用参考视频中的人物身份。';

  return [
    `生成一个 ${unit.duration.toFixed(3)} 秒、720p、${project.ratio} 的真人带货视频单元。`,
    '参考视频只用于动作、构图、景别、运镜、场景、道具位置、剪辑节奏、音乐情绪、环境声和音效节奏，并提供说话人的声音特征。',
    presenterInstruction,
    '商品及其款式、袖长、材质和颜色必须严格使用商品参考图与下方事实，不得沿用参考视频的旧商品。',
    '按参考视频的时间结构复刻动作和镜头，画幅不一致时重新适配构图，但不得改变镜头顺序和动作逻辑。',
    '开启自然中文人声和准确口型，并生成匹配参考片情绪的音乐、环境声和音效。使用参考视频中说话人的音色、声线、口音、语气、语速和情绪来朗读新口播。参考视频的原台词只用于声音特征参考，完全忽略其文字语义和旧商品信息。',
    '必须按下方时间轴逐字朗读新口播，不得说出参考视频中的商品名、款式、材质、颜色、规格、功效或价格；旧台词与新口播冲突时始终以新口播为准。',
    '禁止在画面中生成任何可读文字、字幕、价格或商标贴纸，所有文字将在后期重新渲染。',
    '新口播时间轴：',
    dialogue || '- 本单元无口播，保留自然音乐、环境声和动作音效。',
    '商品事实约束：',
    facts,
    '不得编造商品参数，不得说出严禁表达；不得出现参考商品、参考人物或错误品牌。'
  ].join('\n');
}

export function buildAnalysisPrompt(input: {
  product: ProductBrief;
  shots: Shot[];
  speechSegments: SpeechSegment[];
  duration: number;
}): string {
  return [
    '你是短视频结构迁移分析器。根据抽帧图、镜头时间和语音段落，为新商品生成严格 JSON。',
    `视频时长：${input.duration.toFixed(3)} 秒`,
    `镜头：${JSON.stringify(input.shots.map(({ start, end }) => ({ start, end })))}`,
    `语音段落：${JSON.stringify(input.speechSegments.map(({ start, end }) => ({ start, end })))}`,
    `新商品事实：${JSON.stringify(input.product)}`,
    '输出对象必须包含 summary、script、overlays、warnings。script 每项包含 start、end、text，数量与语音段落一致；不得使用禁用表达或编造事实。',
    'overlays 每项包含 start、end、text、xPercent、yPercent、fontSize、color、outlineColor，可选 backgroundColor。只输出 JSON，不要 Markdown。'
  ].join('\n');
}

export function buildCopyPrompt(input: {
  product: ProductBrief;
  shots: Shot[];
  speechSegments: SpeechSegment[];
  referenceTranscript: ReferenceTranscriptSegment[];
  duration: number;
}): string {
  return [
    '你是商品短视频口播改写器。请输出严格 JSON 对象，不要 Markdown。',
    `视频时长：${input.duration.toFixed(3)} 秒`,
    `分镜时间：${JSON.stringify(input.shots.map(({ start, end }) => ({ start, end })))}`,
    `语音段落：${JSON.stringify(input.speechSegments.map(({ start, end }) => ({ start, end })))}`,
    `参考原台词：${JSON.stringify(input.referenceTranscript.map(({ start, end, text }) => ({ start, end, text })))}`,
    `新商品事实：${JSON.stringify(input.product)}`,
    '商品事实优先级最高，也是唯一可用的事实来源；不得添加未提供的品牌、款式、袖长、材质、颜色、规格、功效或价格，不得输出禁止表达。',
    '逐段模仿句式、开场方式、语气、句长、卖点顺序、停顿与促单节奏，但不得逐字复制完整原句。',
    '原台词中的商品事实必须全部替换；与新商品冲突的内容必须删除或改写，资料中没有的属性不得猜测。',
    'script 必须与语音段落一一对应，数量相同，start 和 end 逐项原样复制。',
    '输出格式：{"summary":"方案摘要","script":[{"start":0,"end":4,"text":"口播"}],"warnings":[]}'
  ].join('\n');
}
