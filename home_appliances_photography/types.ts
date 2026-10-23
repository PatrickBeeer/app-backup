export enum ApplianceType {
  TV = '电视机',
  REFRIGERATOR = '冰箱',
  AIR_CONDITIONER = '空调',
  WASHING_MACHINE = '洗衣机/烘干机',
  WATER_HEATER = '热水器',
  DISHWASHER = '洗碗机',
  KITCHEN_STOVE = '集成灶/油烟机/燃气灶',
  STERILIZER = '消毒柜',
}

export enum AspectRatio {
  SQUARE = '1:1',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
}

export enum SceneStyle {
  MODERN = '现代简约风',
  NORDIC = '北欧温馨风',
  LUXURY = '高级轻奢风',
  NEW_CHINESE = '雅致新中式',
  WABI_SABI = '日式侘寂风',
  CREAM = '温柔奶油风',
}

export enum ModelEthnicity {
  CHINESE = '亚洲人',
  CAUCASIAN = '欧美人',
  LATINO = '拉丁裔',
  AFRICAN = '非洲裔',
}

export enum ModelAge {
  CHILD = '儿童',
  YOUTH = '青年',
  MIDDLE_AGED = '中年',
  ELDERLY = '老年',
}

export enum ModelGender {
  FEMALE = '女性',
  MALE = '男性',
  COUPLE = '一女一男',
  FAMILY = '一家三口',
  FEMALE_CHILD = '女和儿童',
}

export enum BrandStyle {
  NONE = '无特定品牌',
  HAIER = '海尔风格',
  MIDEA = '美的风格',
  GREE = '格力风格',
  SIEMENS = '西门子风格',
}

export interface AppState {
  uploadedImage: string | null;
  selectedAppliance: ApplianceType;
  selectedAspectRatio: AspectRatio;
  selectedSceneStyle: SceneStyle;
  selectedModelEthnicity: ModelEthnicity;
  selectedModelAge: ModelAge;
  selectedModelGender: ModelGender;
  selectedBrandStyle: BrandStyle;
  useModel: boolean;
  customPrompt: string;
  sceneRegenPrompt: string;
  modelRegenPrompt: string;
  isGenerating: boolean;
  isDetecting: boolean;
  resultSceneImage: string | null;
  resultModelImage: string | null;
  loadingStep: string;
}
