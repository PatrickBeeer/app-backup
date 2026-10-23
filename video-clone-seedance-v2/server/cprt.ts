import { config } from './config';
import { createTokendanceVideoTask, getTokendanceVideoTask, isTokendanceTask, TOKENDANCE_MODEL } from './tokendance';
import {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  type CprtConversionSlot,
  type CprtMultimodalVideoModel,
  type BackgroundReplacementInput,
  type VoiceReplacementInput,
  toCprtProviderResolution,
} from '../shared/cprtContract';
import { isCloneVoiceId } from '../shared/speechContract';

// CPRT 多模态视频 API：https://ai-cprt-xyz.apifox.cn/ （本目录 docs/cprt/multimodal-video.md）

export {
  CPRT_DURATION_SECONDS,
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
};
export type { CprtMultimodalVideoModel };

type CprtTaskCreateResult = {
  /** Ark 网关（master-video-*）创建任务返回 id；旧 free-video wrapper 返回 taskId。 */
  id?: string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
};

type CprtTaskResultItem = {
  url?: string | null;
  outputType?: string | null;
  text?: string | null;
  name?: string | null;
};

type CprtTaskQueryResult = {
  id?: string;
  taskId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Ark 网关的失败信息体。 */
  error?: { code?: string; message?: string } | null;
  /** Ark 网关的成片：content.video_url；旧 wrapper 的成片在 results[]。 */
  content?: { video_url?: string | null } | null;
  results?: CprtTaskResultItem[] | null;
  failedReason?: Record<string, unknown> | null;
};

const LIPSTICK_ACTION_GUARD_PROMPT = [
  '这是口红试色/涂抹测评场景：只保持唇膏或唇刷接触嘴唇、沿唇线涂抹的动作。',
  '嘴巴可以按参考视频自然微张，但舌头必须始终收在口腔内不可见；不要吐舌、舔唇、伸舌或让舌头接触唇膏。',
  '唇部内部只保留自然口腔阴影、牙齿或唇部高光，不要把口红反光、牙齿或阴影生成舌头。',
].join(' ');

// 通用口腔约束：与品类无关，任何说话/展示场景都适用，且不会引入「口红」这个概念。
const ORAL_HYGIENE_PROMPT = [
  '口腔与唇部：嘴巴可随说话或展示自然开合，但舌头必须始终收在口腔内不可见；',
  '严禁吐舌、舔唇、伸舌，也不要把口腔阴影、牙齿或唇部高光误生成舌头。',
].join(' ');

// 唇部/口红类产品的关键词。只有命中时才声明「口红试色场景」，
// 否则模型会在任何品类（服饰、数码、食品…）里凭空画出唇膏。
const LIPSTICK_SCENE_KEYWORDS = ['口红', '唇釉', '唇彩', '唇泥', '唇膏', '唇蜜', '唇线', 'lipstick'];

function isLipstickScene(userPrompt: string): boolean {
  const text = String(userPrompt || '');
  return LIPSTICK_SCENE_KEYWORDS.some((key) => text.includes(key));
}

// 产品状态演化：电商测评最常见的翻车点是「效果瞬间出现 / 不累积 / 覆盖到没涂到的地方」。
// 这组约束把「效果必须沿接触轨迹逐帧累积」写成硬规则，并按品类补充该产品正确的物理过程，
// 让模型按真实的时间顺序演算状态，而不是一次性把「最终结果」贴上去。
const PRODUCT_STATE_EVOLUTION_PROMPT = [
  '产品状态演化规则（涂抹、上妆、护理、清洁类场景必须遵守）：',
  '产品效果只能出现在与产品实际接触过的位置，且必须沿接触轨迹由浅到深、由少到多逐帧累积，呈现清晰的渐进过程。',
  '严禁：未接触区域提前变色、一接触就整片瞬间变色（跳变/闪变）、颜色或质地在帧与帧之间来回跳、产品凭空出现或凭空消失。',
  '变化速度必须跟随手部或工具的移动速度：涂到哪里变到哪里，效果边界随笔触推进而移动，不得提前出现或滞后残留。',
  '若是擦拭、卸除、清洁类动作，方向相反：被擦拭区域必须随擦拭动作逐帧变干净，残留随擦拭工具被带走消失。',
].join('');

type ProductActionRule = {
  keys: string[];
  rule: string;
};

// 按品类把「正确的物理变化顺序」写清楚，模型就不需要自己猜过程，
// 也就不会出现「一涂上去就满嘴红色」这类跳变。
const PRODUCT_ACTION_RULES: ProductActionRule[] = [
  {
    keys: LIPSTICK_SCENE_KEYWORDS,
    rule: [
      '【唇部产品】唇色必须从人物原本的浅色/裸色唇开始：第一笔只在唇膏或唇刷接触到的位置留下淡淡一层，',
      '随后每一笔沿唇线推进、逐帧由浅到深地叠加，直到达到目标红色；涂抹过程中允许出现「已涂区域」与「未涂区域」的自然分界。',
      '严禁一开始就满嘴红色、严禁一接触整片嘴唇瞬间变红、严禁未涂抹的唇部或唇周提前变色、严禁唇色在帧间跳变或忽深忽浅。',
      '唇纹、唇部高光与唇线轮廓要始终保持清晰，不要把颜色糊成一片。',
    ].join(''),
  },
  {
    keys: ['粉底', '遮瑕', '气垫', 'BB霜', 'CC霜', '粉底液', '粉膏', '素颜霜'],
    rule: [
      '【底妆产品】底妆必须从涂抹起点开始，随手指/美妆蛋/刷子由局部向周围逐帧推开，肤色逐帧变得更均匀、瑕疵逐帧被覆盖。',
      '已涂抹区域与未涂抹区域之间要有自然过渡的边界，边界随手部移动而推进。',
      '严禁全脸瞬间变白或瞬间遮瑕、严禁涂抹后没有任何变化、严禁出现硬切色块或界线分明的面具脸。',
    ].join(''),
  },
  {
    keys: ['眼影', '腮红', '修容', '高光', '眉粉', '鼻影'],
    rule: [
      '【粉状彩妆】颜色必须随扫刷逐层加深：第一层淡、之后每一扫逐帧更浓，并由落刷中心向边缘自然晕染开。',
      '严禁一次性出现完整浓色、严禁颜色溢出到未扫过的区域、严禁色块边缘生硬。',
    ].join(''),
  },
  {
    keys: ['眉笔', '眼线', '眼线笔', '睫毛膏', '染眉膏', '眼线液'],
    rule: [
      '【线条类彩妆】线条必须随笔尖移动一笔一笔逐帧画出，由短到长、由淡到实；睫毛由根部向梢部逐帧变浓变长。',
      '严禁线条凭空完整出现、严禁已画好的线条抖动重画或消失、严禁睫毛一次成型。',
    ].join(''),
  },
  {
    keys: ['染发', '发膜', '染发剂', '头发上色', '发色'],
    rule: [
      '【染发产品】发色必须随产品涂抹与梳理过程逐帧由原色过渡到目标色，先出现在发根或产品接触到的发束上，再扩散到整头。',
      '严禁整头瞬间变色、严禁未涂抹区域提前变色。',
    ].join(''),
  },
  {
    keys: ['指甲油', '甲油胶', '美甲', '指甲'],
    rule: [
      '【美甲产品】甲面颜色必须随刷头涂抹逐帧覆盖，由指尖向指根、由一侧到另一侧推进；未涂到的区域保持原甲色。',
      '严禁整片甲面瞬间上色、严禁颜色溢出到甲沟皮肤；若出现照灯环节，甲面由湿润哑光逐帧转为光泽。',
    ].join(''),
  },
  {
    keys: ['面霜', '精华', '乳液', '防晒', '面膜', '护肤', '身体乳', '精油', '芦荟胶', '眼霜'],
    rule: [
      '【护肤品质地】膏体或液体被推开后，必须随按摩动作逐帧变薄、变透明，逐步被皮肤吸收直至基本消失，只留下自然的光泽感。',
      '严禁膏体一直堆积在皮肤上不吸收、严禁未涂抹区域也跟着变油亮、严禁质地凭空消失。',
    ].join(''),
  },
  {
    keys: ['喷雾', '定妆', '散粉', '蜜粉', '香水'],
    rule: [
      '【喷雾/散粉】必须有细密的雾状或粉状颗粒喷出，并逐帧散开、落定；皮肤由油光逐帧转为哑光或定妆状态。',
      '严禁没有雾感/粉感直接改变肤质、严禁颗粒凭空出现又瞬间消失。',
    ].join(''),
  },
  {
    keys: ['卸妆', '擦拭', '清洁', '洗面奶', '洁面', '去角质', '卸妆水', '卸妆油'],
    rule: [
      '【卸除/清洁类（方向相反）】被擦拭或清洁的区域必须随擦拭动作逐帧由带妆/带污变干净，污渍随棉片或毛巾被带走而消失。',
      '严禁擦完区域仍有残留、严禁未擦拭区域提前变干净、严禁妆容瞬间全部消失。',
    ].join(''),
  },
  {
    keys: ['牙膏', '刷牙', '牙齿美白'],
    rule: [
      '【口腔清洁】泡沫必须随刷牙动作逐帧增多，牙齿由原色逐帧变得更白更亮。',
      '严禁牙齿瞬间变白、严禁泡沫一次性充满整个口腔。',
    ].join(''),
  },
];

function buildProductActionRules(userPrompt: string): string {
  const text = String(userPrompt || '');
  const matched = PRODUCT_ACTION_RULES.filter((item) => item.keys.some((key) => text.includes(key)));
  if (!matched.length) {
    return '';
  }
  return ['本次场景的产品动作补充约束（按品类）：', ...matched.map((item) => item.rule)].join('\n');
}

// 人物身份锚定：强制把参考视频里的人整体换成参考图里的人（脸 + 发型 + 体型 + 服饰），
// 与用户提示词并列下发，避免用户提示词写得弱时只换衣服不换脸。
const IDENTITY_ANCHOR_PROMPT = [
  '【最高优先级 · 参考图片决定人物的一切】参考图片的优先级高于本次请求的任何其他描述，包括用户提示词和参考视频里的人物形象。',
  '本次生成必须以参考图片为唯一准绳来重建人物：参考视频只提供动作、运镜、场景、手持物品与光影；',
  '参考视频里原有人物的脸、发型、发色、穿搭、配饰、体型一律作废，严禁保留其任何一处特征。',
  '必须完全按参考图片实现的属性：脸型与五官（眉、眼、鼻、唇、牙齿）、肤色与肤质、面部轮廓；',
  '发型、发色、发长、发际线、刘海、胡须与妆容；头身比例与体型；',
  '穿搭服饰（上衣、外套、裤子、裙子、鞋、袜）与配饰（帽子、眼镜、首饰、围巾、包）——款式、颜色、材质、图案都与参考图片一致。',
  '严禁只换脸不换发型或穿搭：不得出现「参考图的脸 + 参考视频的衣服或发型」这种混搭；',
  '不得出现两张脸融合、只换半张脸、面部闪烁、镜头切换后又变回原人物。',
  '视频从头到尾每一帧都必须是参考图片里的同一个人：同一张脸、同一个发型、同一套穿搭，',
  '侧脸、回头、遮挡、光线变化、快速晃动后依然保持一致。',
  '只有当用户提示词明确写出「换成某件具体衣物/造型」时，才以用户提示词为准；没有这类明确指令时一律以参考图片为准。',
  '如果参考图片里有多张人脸，只采用最清晰、最大、正对镜头的主脸作为身份；其余一律忽略。',
  '光影与环境融合（必须遵守）：被替换人物必须与新场景的光照方向、色温、环境光、阴影、反射保持一致；人物边缘要自然，不能有明显抠图感、白边、锯齿或羽化光圈。',
  '肤色要随场景光线自然变化，明暗过渡柔和；人物在地面的投影、与背景的遮挡关系、景深和运动模糊必须与参考视频原有镜头一致，不能浮在背景上。',
  '整体画面必须像一镜到底实拍，人物与背景在透视、比例、清晰度、噪点上完全统一，禁止任何贴图或拼贴感。',
].join(' ');

// 运镜与道具复刻：视频复刻的核心就是「除了人，其他一切都要原样搬过来」。
// 模型默认会重新构图、顺手稳定画面、把手里产品画变形甚至弄丢，这里逐条写死。
const MOTION_AND_PROP_PRESERVATION_PROMPT = [
  '【运镜与画面复刻 · 必须逐帧一致】这是一次动作与镜头复刻。',
  '范围说明：本条要求「与参考视频一致」的只针对人物动作与人物之外的画面要素；',
  '人物自身的脸、发型、发色、穿搭、配饰、体型不在本条范围内，那些一律以参考图片为准（见最高优先级条目）。',
  '镜头运动：机位、焦距、景别、推/拉/摇/移/跟随/环绕、变焦与焦点变化的节奏必须与参考视频完全相同；',
  '禁止重新构图或裁切、禁止改变运镜速度与方向、禁止增删镜头或切换机位。',
  '镜头晃动必须同等复刻（重点）：参考视频晃得多剧烈，成片就要晃得多剧烈——',
  '手持抖动、走路起伏、奔跑颠簸、呼吸感的幅度与频率都要与参考视频对齐；',
  '严禁把画面「稳定化」、严禁削弱抖动幅度、严禁只保留轻微晃动、严禁输出平滑顺滑的镜头。',
  '构图对齐：人物与物体在画面中的位置、大小、朝向、与镜头的距离必须与参考视频逐帧一致；'
  + '背景元素的移动速度与视差随镜头同步变化，人物运动轨迹（走位、转身、抬手）逐帧一致。',
  '手持物品与道具：参考视频中人物手上的产品、包装、工具（口红、瓶罐、刷具、包装盒、仪器等）必须完整保留，',
  '其形状、大小、颜色、材质、文字与 logo 都与参考视频一致；',
  '（这里指的是手里拿的东西，不是人物身上的衣物——衣物以参考图片为准。）',
  '禁止物品消失、变形、漂浮、换色、数量变化，也禁止凭空冒出参考视频里没有的物品。',
  '手与物品的交互：握持位置、手指遮挡关系、拿起/涂抹/展示/放下的动作轨迹必须逐帧一致；',
  '手的数量与手指形态保持正常，禁止多指、少指、手指粘连或手部融化。',
  '场景与其余元素：家具、陈设、陪体人物（若存在）、光影走向、遮挡层次与参考视频一致，不要增删或重新布置。',
].join(' ');

class CprtRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CprtRequestError';
  }
}

export function buildCprtPrompt(prompt: string): string {
  const blocks = [prompt.trim(), ORAL_HYGIENE_PROMPT, PRODUCT_STATE_EVOLUTION_PROMPT];
  // 口红场景声明只在真的做唇部产品时下发：无条件下发会让模型在任何品类里都画出唇膏。
  if (isLipstickScene(prompt)) {
    blocks.push(LIPSTICK_ACTION_GUARD_PROMPT);
  }
  const productRules = buildProductActionRules(prompt);
  if (productRules) {
    blocks.push(productRules);
  }
  return blocks.join('\n\n');
}

const VOICE_LANGUAGE_LABELS: Record<string, string> = {
  keep: '保持参考视频原语音语言',
  'zh-CN': '中文普通话',
  'en-US': '美国英语',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'fr-FR': '法语',
  'de-DE': '德语',
  'es-ES': '西班牙语',
  'pt-BR': '巴西葡萄牙语',
  'ar-SA': '阿拉伯语',
};

// 语音替换：语言必须真的换掉，同时保住参考音频的音色/性别（例如女声换语言后仍是同一音色的女声）。
function buildVoiceReplacementPrompt(voice: VoiceReplacementInput): string {
  const languageLabel = VOICE_LANGUAGE_LABELS[voice.language] || voice.language;
  const keepLanguage = voice.language === 'keep';
  const lines: string[] = [
    '语音替换要求：重新生成视频语音，保留参考视频中人物说话的时机、口型节奏和情绪。',
    `目标语音语言/国家：${languageLabel}。`,
  ];

  if (!keepLanguage) {
    lines.push(
      `成片语音必须且只能使用${languageLabel}（语言代码 ${voice.language}）说话，` +
      '严禁沿用参考视频或参考音频里的原语言；不要出现中英混杂、多语言切换或字幕与语音语言不一致。',
    );
  }

  if (isCloneVoiceId(voice.voiceId)) {
    lines.push('配音音色已由用户上传的人声样本通过声音复刻生成（音色、性别、语气与样本一致）：');
    lines.push(keepLanguage
      ? '成片语音必须使用该复刻音色说话，保持参考视频中人物说话的时机、口型节奏和情绪。'
      : `成片语音必须用这位复刻音色说${languageLabel}，只替换所说内容的语言，不要换成其他音色；也不要保留参考音频的原语言。`);
  } else {
    lines.push(keepLanguage
      ? '请使用自然、清晰、适合人物形象的音色。'
      : `请使用自然、清晰、适合人物形象的音色，并且必须说${languageLabel}。`);
  }

  lines.push('不要生成杂音、回声或与口型明显不同步的语音。');

  // 生成前已合成好目标音频（audioUrls 传入）：要求模型对口型朗读该音频，
  // 这是「音频连贯 + 嘴型对齐」的关键——绝不能再自行生成一段新语音。
  if (voice.audioUrl) {
    lines.push(
      '已提供目标语音音频（audioUrls）：视频人物的口型必须严格对齐这段音频，这是本次生成最高优先级的画面约束。',
      '口型对齐要求（逐音节/viseme 级别）：嘴唇开合幅度、张嘴与闭嘴的时机、每个音节的口型形状、句读停顿，'
      + '都必须与音频波形逐字对应；牙齿与舌头的可见程度随发音自然变化。',
      '严禁：口型领先或滞后于音频、说话时嘴不动、静音段落嘴还在动、口型与音节数量对不上、口型抖动或漂移、沿用参考视频原来的口型节奏。',
      '视频整体节奏（动作快慢与总时长）跟随这段音频；不要另生成或叠加任何语音。',
      '成片音轨必须就是这段音频（内容与语言都一致）：严禁沿用参考视频的原语音、'
      + '严禁出现参考视频的原语言人声、严禁中外交杂或两种语言同时出现。',
    );
  } else {
    lines.push('口型必须与上述台词的发音逐字对齐，严禁嘴型与所说内容不符或嘴型乱动。');
  }
  return lines.join(' ');
}

// 背景替换之所以容易「假」，本质是新背景由模型重新想象，它的光照、接触关系、透视、噪点
// 都无法与前景人物精确对齐，于是人物像贴纸一样浮在画面上。
// 这里把「人物与背景必须在物理层面互相影响」逐条写成硬约束，并压低过度渲染的倾向。
function buildBackgroundReplacementPrompt(background: BackgroundReplacementInput): string {
  const lines: string[] = [
    '背景替换要求：替换参考视频中的环境背景，同时保持人物动作、构图、镜头运动、手部物品和主体边缘自然，人物不要被背景遮挡。',
    background.prompt ? `目标背景：${background.prompt}。` : '目标背景按上传的背景参考图生成。',
    '光照一致性（最关键）：新背景的主光方向、色温、强度、软硬必须与原视频打在人物面部和身上的光完全匹配；' +
      '原视频是正面柔光，背景就不能出现侧逆光；背景的亮部与人物亮部必须在同一侧，光源数量也要与人物身上的高光一致。',
    '环境互动：背景的光必须反射回人物身上——人物边缘要有来自背景的环境光与轮廓光，肤色要带一点背景色，' +
      '禁止人物与背景零交互、像贴纸一样贴在画面上。',
    '接触关系：人物脚底与地面、身体与背景物体接触处必须有真实的接触阴影和投影，投影方向随主光方向一致，' +
      '禁止人物悬空、禁止投影缺失或方向错误。',
    '透视与相机运动：新背景必须沿用原视频的机位、焦距、透视网格和镜头运动；人物或镜头移动时背景视差必须与人物同步，' +
      '禁止背景独立漂移、抖动或透视错乱。',
    '景深与清晰度：焦平面与画质必须与人物一致，背景虚化程度遵循原镜头的景深，' +
      '禁止人物清晰而背景锐利失真，也禁止背景被过度虚化成塑料感。',
    '真实质感：背景必须带真实摄影的质感——轻微的传感器噪点、镜头暗角、自然的光比与色彩，' +
      '禁止过度干净、过度饱和、过曝，禁止出现 3D 渲染或油画般的塑料感。',
    '时序稳定：背景的空间结构在整段视频中必须保持稳定，禁止逐帧变形、纹理游动、墙面呼吸或元素闪烁。',
    '边缘融合：人物边缘（尤其发丝、半透明衣物、快速运动部位）必须自然过渡，禁止白边、锯齿、羽化光圈或边缘闪烁。',
  ];

  if (background.imageUrl) {
    lines.push(
      '已提供背景参考图：请严格遵循参考图的光照方向、色温、透视、材质与色调来重建背景，' +
      '不要脱离参考图自行想象新的空间结构；同时不要改变人物身份和动作。',
    );
  }

  return lines.join(' ');
}

function buildGenerationPrompt(input: {
  prompt: string;
  voiceReplacement?: VoiceReplacementInput;
  backgroundReplacement?: BackgroundReplacementInput;
  referenceImageCount?: number;
}): string {
  const sections = [buildCprtPrompt(input.prompt)];

  if ((input.referenceImageCount || 0) > 0) {
    sections.push(IDENTITY_ANCHOR_PROMPT);
  }

  // 运镜与手持道具必须原样复刻（与是否换人无关，视频复刻任务一律要求）。
  sections.push(MOTION_AND_PROP_PRESERVATION_PROMPT);

  const voice = input.voiceReplacement;
  if (voice?.enabled) {
    sections.push(buildVoiceReplacementPrompt(voice));
  }

  const background = input.backgroundReplacement;
  if (background?.mode === 'replace') {
    sections.push(buildBackgroundReplacementPrompt(background));
  }

  return sections.join('\n\n');
}

export type CprtVideoTask = {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  videoUrl: string | null;
  errorMessage: string | null;
};

function authHeaders(): HeadersInit {
  if (!config.cprtApiKey) {
    throw new Error('CPRT_KEY is not configured for the video-clone-seedance BFF.');
  }

  return {
    Authorization: `Bearer ${config.cprtApiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function normalizeStatus(status: string): CprtVideoTask['status'] {
  const normalized = String(status || '').trim().toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED'].includes(normalized)) {
    return 'completed';
  }
  if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized)) {
    return 'failed';
  }
  if (['QUEUED', 'SUBMITTED', 'PENDING'].includes(normalized)) {
    return 'queued';
  }
  return 'running';
}

async function requestCprt<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.cprtBaseUrl}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`CPRT 请求失败：${error instanceof Error ? error.message : 'network error'}`);
  }

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    // CPRT 网关用小写 error/code/message，Ark 直通错误用大写 Error/Code/Message，两者都要能读出。
    const nestedError = payload?.error ?? payload?.Error;
    const nestedMessage = typeof nestedError === 'object' && nestedError
      ? (nestedError.message ?? nestedError.Message)
      : nestedError;
    const nestedCode = typeof nestedError === 'object' && nestedError
      ? String(nestedError.code ?? nestedError.Code ?? '')
      : '';
    const message = String(
      payload?.errorMessage
      || payload?.message
      || nestedMessage
      || `HTTP ${response.status}`,
    ).trim();
    const code = String(payload?.errorCode || nestedCode || '').trim();
    throw new CprtRequestError(
      response.status,
      code,
      message || `CPRT request failed (${response.status})`,
    );
  }

  return payload as T;
}

export type MasterAssetType = 'Image' | 'Video' | 'Audio';

// master-video 素材送审：https://ai-cprt-xyz.apifox.cn/472955655e0
// master-video-* 要求参考图/视频/音频先送审拿 asset_id，再以 asset://<asset_id> 传入 content 分片。
const masterAssetIdCache = new Map<string, string>();

/** 仅供测试使用：清空送审缓存，保证各用例相互独立。 */
export function clearMasterAssetCacheForTests(): void {
  masterAssetIdCache.clear();
}

export async function submitMasterAssetForReview(
  assetType: MasterAssetType,
  url: string,
): Promise<string> {
  const cached = masterAssetIdCache.get(url);
  if (cached) {
    return cached;
  }
  // TOS 从隧道 URL 拉取素材偶发超时（InvalidParameter.DownloadFailed / context deadline exceeded），
  // 属于瞬时网络问题，重试通常可成功。
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = await requestCprt<{ asset_id?: string; errorMessage?: string }>('/master/asset/submit', {
        method: 'POST',
        body: JSON.stringify({ asset_type: assetType, url }),
      });
      const assetId = String(payload?.asset_id || '').trim();
      if (!assetId) {
        throw new Error(String(payload?.errorMessage || `素材送审未返回 asset_id：${url}`));
      }
      masterAssetIdCache.set(url, assetId);
      return assetId;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransientDownloadFailure = /DownloadFailed|context deadline exceeded|failed to download media/i.test(message);
      if (!isTransientDownloadFailure || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw lastError;
}

export async function getMasterAssetStatus(assetId: string): Promise<string> {
  const payload = await requestCprt<{ status?: string }>('/master/asset/status', {
    method: 'POST',
    body: JSON.stringify({ id: assetId }),
  });
  return String(payload?.status || '').trim();
}

export async function waitForMasterAssetActive(assetId: string, timeoutMs = 180_000): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    const status = await getMasterAssetStatus(assetId);
    if (status === 'Active') {
      return;
    }
    if (/(reject|fail|block|deny|violation)/i.test(status)) {
      throw new Error(`素材审核未通过（${status}）：${assetId}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`素材审核超时（${status || '未知状态'}）：${assetId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function ensureMasterAssetRef(assetType: MasterAssetType, url: string): Promise<string> {
  const assetId = await submitMasterAssetForReview(assetType, url);
  try {
    await waitForMasterAssetActive(assetId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const assetLabel = assetType === 'Image' ? '参考图' : assetType === 'Video' ? '参考视频' : '参考音频';
    throw new Error(`${assetLabel}未通过平台内容审核（${url}）：${reason}`);
  }
  return `asset://${assetId}`;
}

export async function createMultimodalVideoTask(input: {
  model: string;
  prompt: string;
  resolution: string;
  durationSeconds: number;
  ratio?: string;
  imageUrls?: string[];
  videoUrls?: string[];
  voiceReplacement?: VoiceReplacementInput;
  backgroundReplacement?: BackgroundReplacementInput;
  realPersonMode?: boolean;
  conversionSlots?: CprtConversionSlot[];
  seed?: number;
}): Promise<{ taskId: string; status: string }> {
  const imageUrls = [
    ...(input.imageUrls?.length ? input.imageUrls : []),
    ...(input.backgroundReplacement?.mode === 'replace' && input.backgroundReplacement.imageUrl
      ? [input.backgroundReplacement.imageUrl]
      : []),
  ];
  // 生成前已合成好的目标音频：开启语音替换且服务端已合成时，作为唯一语音素材。
  const voiceAudioSource = input.voiceReplacement?.enabled
    ? input.voiceReplacement.audioUrl
    : undefined;
  const generationPrompt = buildGenerationPrompt({
    ...input,
    // 身份锚定只针对「人物参考图」；背景参考图不算。
    referenceImageCount: input.imageUrls?.length || 0,
  });

  // master-video-* 走 Ark 协议（素材先送审，再以 asset:// 引用）；
  // 其他模型（如日后恢复的 free-video wrapper）保留旧的平铺字段方法。
  if (input.model === TOKENDANCE_MODEL) {
    return createTokendanceVideoTask({
      prompt: generationPrompt,
      resolution: toCprtProviderResolution(input.resolution),
      durationSeconds: input.durationSeconds,
      ratio: input.ratio,
      imageUrls: input.imageUrls,
      videoUrls: input.videoUrls,
      backgroundImageUrl: input.backgroundReplacement?.mode === 'replace'
        ? input.backgroundReplacement.imageUrl : undefined,
      audioUrl: voiceAudioSource,
      generateAudio: input.voiceReplacement?.enabled,
    });
  }
  const payload = input.model.startsWith('master-video')
    ? await createViaMasterArk(input, imageUrls, voiceAudioSource, generationPrompt)
    : await createViaFreeVideoWrapper(input, imageUrls, voiceAudioSource, generationPrompt);

  const taskId = String(payload?.id || payload?.taskId || '').trim();
  if (!taskId) {
    throw new Error(String(payload?.errorMessage || 'CPRT 未返回任务ID。'));
  }

  return { taskId, status: String(payload?.status || 'QUEUED') };
}

// master-video 方法：https://ai-cprt-xyz.apifox.cn/498723770e0
// 参考图/视频/音频全部先送审（串行，避免争抢隧道带宽导致 TOS 下载超时）拿到 asset_id，
// 通过后以 asset:// 引用写入 content 分片；语音作为 audio_url 分片（role=reference_audio），
// generate_audio 为平铺布尔。
async function createViaMasterArk(
    input: { model: string; resolution: string; durationSeconds: number; ratio?: string; videoUrls?: string[]; voiceReplacement?: VoiceReplacementInput; seed?: number },
  imageUrls: string[],
  voiceAudioSource: string | undefined,
  generationPrompt: string,
): Promise<CprtTaskCreateResult> {
  // 串行送审：并行会争抢隧道带宽，放大 TOS 下载超时（InvalidParameter.DownloadFailed）。
  const imageAssetUrls: string[] = [];
  const videoAssetUrls: string[] = [];
  const audioAssetUrls: string[] = [];
  for (const url of imageUrls) {
    imageAssetUrls.push(await ensureMasterAssetRef('Image', url));
  }
  for (const url of (input.videoUrls?.length ? input.videoUrls : [])) {
    videoAssetUrls.push(await ensureMasterAssetRef('Video', url));
  }
  if (voiceAudioSource) {
    audioAssetUrls.push(await ensureMasterAssetRef('Audio', voiceAudioSource));
  }

  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: generationPrompt },
  ];
  // Ark rejects first_frame together with reference_image or reference_video.
  for (const url of imageAssetUrls) {
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  for (const url of videoAssetUrls) {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  }
  for (const url of audioAssetUrls) {
    content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  }

  return requestCprt<CprtTaskCreateResult>('/v1/chat/asyncTask', {
    method: 'POST',
    body: JSON.stringify({
      model: input.model,
      content,
      resolution: toCprtProviderResolution(input.resolution),
      duration: input.durationSeconds,
      ratio: input.ratio || undefined,
      generate_audio: input.voiceReplacement?.enabled || undefined,
      watermark: false,
      seed: Number.isFinite(input.seed as number) ? input.seed : undefined,
      returnOriginData: true,
    }),
  });
}

// free-video wrapper 方法（保留备用）：平铺 prompt/imageUrls/videoUrls/audioUrls，
// 真人参考经 conversionSlots 传入，分辨率沿用 native1080p/native4k 命名。
async function createViaFreeVideoWrapper(
  input: {
    model: string;
    resolution: string;
    durationSeconds: number;
    ratio?: string;
    videoUrls?: string[];
    voiceReplacement?: VoiceReplacementInput;
    realPersonMode?: boolean;
    conversionSlots?: CprtConversionSlot[];
    seed?: number;
  },
  imageUrls: string[],
  voiceAudioSource: string | undefined,
  generationPrompt: string,
): Promise<CprtTaskCreateResult> {
  const legacyResolution = input.resolution === '1080p'
    ? 'native1080p'
    : input.resolution === '4k'
      ? 'native4k'
      : input.resolution;
  return requestCprt<CprtTaskCreateResult>('/v1/chat/asyncTask', {
    method: 'POST',
    body: JSON.stringify({
      model: input.model,
      prompt: generationPrompt,
      resolution: legacyResolution,
      duration: input.durationSeconds,
      ratio: input.ratio || undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      videoUrls: input.videoUrls?.length ? input.videoUrls : undefined,
      audioUrls: voiceAudioSource ? [voiceAudioSource] : undefined,
      generateAudio: input.voiceReplacement?.enabled || undefined,
      realPersonMode: input.realPersonMode || undefined,
      conversionSlots: input.conversionSlots?.length ? input.conversionSlots : undefined,
      seed: Number.isFinite(input.seed as number) ? input.seed : undefined,
      returnOriginData: true,
    }),
  });
}

export async function getMultimodalVideoTask(taskId: string): Promise<CprtVideoTask> {
  if (isTokendanceTask(taskId)) {
    return getTokendanceVideoTask(taskId);
  }
  let payload: CprtTaskQueryResult;
  try {
    payload = await requestCprt<CprtTaskQueryResult>(
      `/v1/chat/asyncTask/${encodeURIComponent(taskId)}`,
    );
  } catch (error) {
    const isPublicTaskId = /^\d{14}_[A-Za-z0-9_-]+$/.test(taskId);
    const isRecoverablePollError = error instanceof CprtRequestError
      && (error.status === 429 || error.status >= 500);
    if (isPublicTaskId && isRecoverablePollError) {
      return {
        taskId,
        status: 'running',
        videoUrl: null,
        errorMessage: null,
      };
    }
    throw error;
  }

  let status = normalizeStatus(String(payload?.status || ''));
  // Ark 网关成片在 content.video_url；旧 free-video wrapper 在 results[].url（name=videoUrl）。
  const arkVideoUrl = String(payload?.content?.video_url || '').trim();
  const videoResult = Array.isArray(payload?.results)
    ? payload.results.find((item) => String(item?.name || '') === 'videoUrl' && String(item?.url || '').trim())
    : null;

  let failedMessage = String(
    payload?.errorMessage
    || payload?.error?.message
    || payload?.errorCode
    || (payload?.failedReason && Object.keys(payload.failedReason).length ? JSON.stringify(payload.failedReason) : '')
    || '',
  ).trim();

  const videoUrl = arkVideoUrl || String(videoResult?.url || '').trim() || null;
  if (status === 'completed' && !videoUrl) {
    status = 'failed';
    failedMessage = failedMessage || 'CPRT 任务已完成，但未返回视频地址。';
  }

  return {
    // CPRT may return an internal numeric ID here. Only the public ID returned
    // by task creation is valid for subsequent /asyncTask/{id} queries.
    taskId,
    status,
    videoUrl: status === 'completed' ? videoUrl : null,
    errorMessage: status === 'failed' ? failedMessage || '视频生成失败。' : null,
  };
}
