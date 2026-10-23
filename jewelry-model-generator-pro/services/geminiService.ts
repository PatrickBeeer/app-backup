import { generateContent, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { JewelryType, ViewType, ModelGender, PromptParts, ImageSize } from '../types';

/**
 * Converts a base64 string to a raw base64 string (removes the data URL prefix)
 */
const cleanBase64 = (base64Data: string): string => {
  return base64Data.split(',')[1] || base64Data;
};

/**
 * Gets the MIME type from a base64 data URL
 */
const getMimeType = (base64Data: string): string => {
  const match = base64Data.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  return match ? match[1] : 'image/jpeg';
};

export const getEthnicityDescription = (ethnicity: string): string => {
  switch (ethnicity) {
    case 'Asian':
      return "东亚裔特征。黑发、深褐色眼睛。肤色：冷白皮或自然浅色调。";
    case 'Caucasian':
      return "欧美裔特征。发色多样（允许棕色/金色）。肤色：白皙到棕褐色。";
    case 'Black':
      return "非裔特征。自然卷发或合适的发型。肤色：深邃、饱满、有光泽的深色调。";
    case 'Hispanic':
      return "拉丁裔特征。深色头发。肤色：橄榄色或暖棕褐色调。";
    case 'South Asian':
      return "南亚裔/印度裔特征。深色波浪/直发。肤色：暖色调中等到深色。";
    default:
      return "全球通用审美标准。";
  }
};

export const getAgeDescription = (age: string): string => {
  switch (age) {
    case '18-24':
      return "18-24岁。年轻、清新的皮肤，Z世代潮流感。";
    case '25-34':
      return "25-34岁。精致、优雅，职场精英或时尚造型。";
    case '35-44':
      return "35-44岁。成熟、精致，富有质感，看起来保养得宜。";
    case '45+':
      return "45岁以上。优雅、端庄，银发或造型得体的发型，保留自然的成熟皮肤纹理（不要完全磨皮祛皱）。";
    default:
      return "成年。";
  }
};

export const getStyleDescription = (style: string): string => {
  switch (style) {
    case 'Minimalist':
      return "风格：极简/干净。背景：纯白、灰白或柔和的混凝土。光线：柔和、漫射、高调的影棚光。氛围：COS、Jil Sander的美学风格。无杂物，焦点完全集中在产品上。表情：冷静、安详，自信而温和的凝视。";
    case 'Luxury':
      return "风格：高端轻奢。背景：深色调的华丽背景，如天鹅绒、大理石或深邃的散景。光线：戏剧性、高对比度、轮廓光、金色时刻的温暖光线。氛围：卡地亚、蒂芙尼广告大片感。优雅且昂贵。表情：成熟、自信，带着一丝了然的微笑。迷人且令人向往。";
    case 'Street':
      return "风格：街头/前卫。光线：直接闪光、硬阴影或霓虹灯点缀。氛围：冷色调、高对比度、潮流、自信、时尚前卫。表情：前卫、自信、冷酷。直接而有力的凝视镜头。";
    case 'Vintage':
      return "风格：复古/怀旧。光线：温暖、带有胶片颗粒感、边缘柔焦。氛围：90年代时尚杂志感、电影感、怀旧、金色调。表情：怀旧、温柔、梦幻。温柔而遥远的目光。";
    case 'Nature':
      return "风格：自然/波西米亚。光线：自然阳光、斑驳的光影（树叶的影子）。氛围：清新的空气感、有机的纹理、亚麻材质、户外感。表情：愉悦、放松、真实。如同享受美好一天般的自然微笑。";
    case 'Influencer':
      return `风格：网红爆款风 (小红书/Ins)。美学：旨在打造病毒式传播的"爆款"单品图。融合了小红书的精致生活感和Instagram的时尚潮流。光线：通常使用美颜环形灯、柔光箱，或在咖啡馆、精品店等场景下的明亮自然窗光，营造干净、高级的氛围。皮肤：完美无瑕的"水光肌"，但保留了真实的皮肤质感，避免塑料感。构图：常为第一人称视角（如自拍）或不经意的抓拍感，旨在营造"这个博主也在用"的亲切感和推荐感。表情：自信、有亲和力，眼神直视镜头，仿佛在与观众分享一个"秘密好物"。`;
    case 'New Chinese':
      return "风格：新中式。背景：极简，受宋代美学启发。可使用宣纸屏风、深色木质家具或简单的禅意园林背景。光线：柔和、自然、漫射，营造宁静氛围。氛围：优雅、诗意，带有静谧的奢华感和文化深度。表情：宁静、端庄、优雅，带着沉思的目光。内心平和。";
    default:
      return "风格：标准电商。干净、专业的影棚光线。表情：中性、愉悦的专业模特表情。";
  }
};

const generateSingleTryOn = async (
  productImageBase64: string,
  modelImageBase64: string,
  type: JewelryType,
  viewType: ViewType,
  gender: ModelGender,
  promptParts: PromptParts,
  isProMode: boolean = false,
  imageSize: ImageSize = '1K',
  aspectRatio: string = '3:4',
  seed?: number
): Promise<string> => {
  try {
    // Pro模式使用 gemini-3.1-flash-image-preview（通过AITO服务），标准模式使用 gemini-3.1-flash-image-preview
    const model = isProMode ? 'gemini-3.1-flash-image-preview' : 'gemini-3.1-flash-image-preview';

    const productMime = getMimeType(productImageBase64);
    const modelMime = getMimeType(modelImageBase64);

    const productPart = {
      inlineData: {
        mimeType: productMime,
        data: cleanBase64(productImageBase64),
      },
    };

    const modelPart = {
      inlineData: {
        mimeType: modelMime,
        data: cleanBase64(modelImageBase64),
      },
    };

    const prompt = `
      角色：顶尖高端珠宝精修与合成专家。
      
      输入：
      - 图片1：珠宝产品（"主角"物品）。
      - 图片2：模特参考（目标身体/姿势）。

      任务：
      将图片1中的珠宝合成到基于图片2姿势的模特身上。
      重要提示：您可能需要根据要求的"人种"和"年龄"重绘模特的脸部和肤色，同时保留图片2的光照和姿势。

      ---------------------------------------------------------
      艺术执导：超写实主义与情感表达
      ---------------------------------------------------------
      ${promptParts.artDirection}

      ---------------------------------------------------------
      铁律 #0：性别一致性 (绝对)
      ---------------------------------------------------------
      - 输出的模特必须是 **${gender === ModelGender.FEMALE ? '女性' : '男性'}**。
      ${gender === ModelGender.FEMALE 
        ? '- 目标：女性。柔美的面部特征，精致的下颌线，女性化造型。' 
        : '- 目标：男性。硬朗的下颌线，更宽的脖颈，短发，无妆容，无女性化特征。'}

      ---------------------------------------------------------
      铁律 #1：模特定义 (强制)
      ---------------------------------------------------------
      ${promptParts.modelDefinition}

      ---------------------------------------------------------
      铁律 #2：视觉风格与场景
      ---------------------------------------------------------
      ${promptParts.styleAndScene}
      - 将此风格的光照、色彩分级和背景氛围应用到整个图像。

      ---------------------------------------------------------
      铁律 #3：人体结构 (杜绝幻觉)
      ---------------------------------------------------------
      - **手部**：如果手部可见，必须不多不少只有5根手指。关节无畸形。
      - **四肢**：绝对不允许出现多余的手臂或腿。严格保持图片2的姿势。
      
      ---------------------------------------------------------
      铁律 #4：物理与材质渲染
      ---------------------------------------------------------
      - **金属**：黄金/白银必须看起来坚硬且有反射感。使用光线追踪质量的反射。
      - **宝石**：钻石/宝石必须有折射和内部光芒。
      - **阴影**：珠宝必须在皮肤上投下阴影。
      - **重力**：
        - 项链必须有重量感，沿着锁骨的曲线垂下。
        - 如果耳环很重，必须让耳垂有轻微的拉伸感。
        - 戒指必须对皮肤有轻微的压迫感。

      ---------------------------------------------------------
      铁律 #5：拍摄景别：${viewType}
      ---------------------------------------------------------
      ${viewType === 'Close-up' ? `
      - **微距模式**：完全聚焦于产品。
      - **模糊背景**：使用 f/2.8 光圈的景深效果。
      - **构图**：如果不需要，不要显示完整的脸。专注于身体部位（颈部/耳朵/手）。
      ` : viewType === 'Medium' ? `
      - **肖像模式**：经典的半身像。
      - **焦点**：珠宝与面部之间的关系。
      ` : `
      - **时尚模式**：完整的造型。
      - **平衡**：珠宝是整体造型的一部分。
      `}

      ---------------------------------------------------------
      铁律 #6：产品保真度 (不要修改物品)
      ---------------------------------------------------------
      - 你是一个"数字孪生"生成器。输出的珠宝必须与图片1完全相同。
      - **禁止** 改变金属颜色。
      - **禁止** 改变宝石数量。
      - **禁止** 改变形状。
      - **警告**：如果用户提供了自定义参考图（图片2），你必须将保持图片1的珠宝外观作为最高优先级。不要让参考图的风格影响产品细节。

      ---------------------------------------------------------
      铁律 #7：电商产品可见性
      ---------------------------------------------------------
      - 主要目标是销售珠宝。产品必须是绝对的主角和视觉焦点。
      - 最终姿势必须清晰、优雅地在模特身上展示产品。
      - 产品不得被衣服、其他身体部位、头发或尴尬的角度遮挡。
      - 如有必要，应调整图片2的姿势以更好地展示商品。例如，耳环需要将头发拨开，项链需要领口敞开，戒指/手链需要将手/手腕置于突出位置。
      - 珠宝必须清晰、完美地对焦。

      ---------------------------------------------------------
      用户自定义指令 (最高优先级)
      ---------------------------------------------------------
      ${promptParts.customInstructions ? `用户提供了必须覆盖通用风格规则的特定指令："${promptParts.customInstructions}"` : "无自定义指令。"}

      ---------------------------------------------------------
      负面提示 (严格避免)
      ---------------------------------------------------------
      - 畸形的手，缺少手指，多余手指，多余四肢，糟糕的人体解剖。
      - 模糊，低质量，像素化，水印，文字，签名。
      - 衰老的皱纹（除非要求老年模特），卡通，动漫，3D渲染，塑料皮肤。
      - 悬浮的珠宝，嵌入皮肤的珠宝。
      - 脸部和身体肤色不匹配。
      - "AI脸"，眼神呆滞，恐怖谷，塑料皮肤。
    `;

    const config: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      }
    };

    if (isProMode) {
      config.imageConfig.imageSize = imageSize;
    }
    
    // Explicitly pass seed for variation
    if (seed !== undefined) {
      config.seed = seed;
    }

    const response = await generateContent({
      model: model,
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: {
        parts: [
          productPart,
          modelPart,
          { text: prompt }
        ]
      },
      config: config
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error("No image generated in the response.");
    }

    return imageUrl;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateTryOn = async (
  productImageBase64: string,
  modelImageBase64: string,
  type: JewelryType,
  viewType: ViewType,
  gender: ModelGender,
  promptParts: PromptParts,
  isProMode: boolean = false,
  imageSize: ImageSize = '1K',
  aspectRatio: string = '3:4'
): Promise<string[]> => {
  // Generate 2 images in parallel with distinct seeds to ensure visual variety
  const seed1 = Math.floor(Math.random() * 1000000);
  const seed2 = Math.floor(Math.random() * 1000000) + 500000;

  const promises = [
    generateSingleTryOn(productImageBase64, modelImageBase64, type, viewType, gender, promptParts, isProMode, imageSize, aspectRatio, seed1),
    generateSingleTryOn(productImageBase64, modelImageBase64, type, viewType, gender, promptParts, isProMode, imageSize, aspectRatio, seed2)
  ];

  try {
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error("One or more generations failed", error);
    throw error;
  }
};

