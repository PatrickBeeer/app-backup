import { Language, ModelAge, ToyCategory, AspectRatio, ToyAnalysis } from './types';

export const UI_TEXTS: Record<Language, any> = {
  zh: {
    title: "BC风格-母婴",
    subtitle: "上传玩具白底图，会生成模特+场景图哦",
    headerTitle: "BC风格-母婴",
    uploadTitle: "上传产品图",
    uploadSubtitle: "拖拽文件到这里，或点击选择",
    uploadButton: "选择文件",
    analyzing: "正在分析玩具...",
    generating: "创意生成中...",
    generatedImagesTitle: "AI 生成场景图",
    originalImageTitle: "原始图片",
    generateAgain: "重新生成",
    error: "发生未知错误",
    imageError: "读取图片失败，请重试。",
    errorTitle: "出错了！",
    tryAgain: "再试一次",
    uploadedToy: "已上传的玩具",
    download: "下载原图",
    modelAgeTitle: "选择模特年龄",
    '0-1岁': "0-1岁 (婴儿)",
    '1-3岁': "1-3岁 (幼儿)",
    '3-5岁': "3-5岁 (学龄前)",
    '5-7岁': "5-7岁 (儿童)",
    '7-12岁': "7-12岁 (少儿)",
    '12岁+': "12岁+ (青少年)",
    refinementTitle: '产品信息与配置',
    productTypeTitle: '产品类型',
    generateButton: '开始生成图片',
    features: "产品卖点 (点击删除，输入回车添加)",
    addFeaturePlaceholder: "+ 添加卖点...",
    ageRange: "适宜年龄",
    aspectRatioTitle: "图片比例",
    '积木玩具': '积木玩具',
    '娃娃和玩偶': '娃娃和玩偶',
    '益智玩具': '益智玩具',
    '遥控玩具': '遥控玩具',
    '毛绒玩具': '毛绒玩具',
    '户外玩具': '户外玩具',
    '其他': '其他',
    close: "关闭",
  },
};

export const TOY_CATEGORIES: ToyCategory[] = ['积木玩具', '娃娃和玩偶', '益智玩具', '遥控玩具', '毛绒玩具', '户外玩具', '其他'];

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '3:4', '9:16'];

export const PROMPTS: Record<Language, any> = {
  zh: {
    analysisSystemInstruction: `你是一个专业的母婴玩具产品分析师。根据用户上传的图片，识别玩具并以JSON格式返回其名称、详细描述、主要功能特点（作为字符串数组）、适宜年龄段以及产品类别。

【重要要求】所有返回的内容必须使用中文，包括：
- name（玩具名称）：必须使用中文名称，例如"积木玩具套装"而不是"Building Blocks Set"
- description（详细描述）：必须使用中文描述，详细说明玩具的外观、材质、玩法等特点
- features（功能特点数组）：数组中的每个特点都必须使用中文，例如["培养动手能力", "激发创造力", "安全环保材质"]
- ageRange（适宜年龄段）：必须使用中文描述，例如"0-3岁"、"3-6岁"、"6-12岁"等
- category（产品类别）：必须从以下列表中选择一个：['积木玩具', '娃娃和玩偶', '益智玩具', '遥控玩具', '毛绒玩具', '户外玩具', '其他']

JSON键必须是 'name', 'description', 'features', 'ageRange', 'category'。请确保所有字段的值都使用中文。`,
    scenePrompts: (toy: ToyAnalysis, modelAge: ModelAge) => {
      // Integrate user-edited features into the prompt
      const featuresText = toy.features.length > 0 ? `重点展示其以下特点：${toy.features.join(', ')}。` : '';
      
      return [
        `一张高品质的生活方式照片，具有'babycare'品牌的干净、简约和温暖的美学风格。一个看起来大约${modelAge}的快乐孩子，正在一个明亮、现代、整洁的游戏室里真实地玩耍着输入图片中完全一样的玩具。${featuresText} 光线采用柔和的自然光。玩具的原始外观、颜色和细节必须完美保留，不得以任何方式改变。`,
        `产品使用场景图，风格需类似'babycare'营销材料。一个大约${modelAge}的孩子正专注于用户图片中的玩具。背景略微模糊，以强调孩子与玩具之间的互动。使用温暖、诱人的色调。${featuresText} 至关重要的是，玩具看起来必须与上传照片中的玩具完全一样。不要更改玩具。`,
        `一张模仿'babycare'品牌风格的俯拍照片。一个${modelAge}的孩子坐在一张浅色、柔软的地毯上，周围有几个简约的道具，正在玩图片中的玩具。构图干净且富有艺术感。玩具必须是所提供图像的精确复制品，不得进行任何修改。`,
        `一张捕捉情感的抓拍照片，模仿'babycare'品牌风格。一个年龄为${modelAge}的孩子在与用户照片中的玩具互动时开怀大笑。这是一个特写镜头，聚焦于孩子和玩具，感觉柔和、温暖而自然。请保持原始图像中玩具外观的绝对完整性。`,
      ];
    }
  }
};

