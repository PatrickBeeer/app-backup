
export interface StyleConfig {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  visualSpecs: {
    backgroundClass: string;
    containerClass: string;
    buttonClass: string;
    textTitleClass: string;
    textContentClass: string;
    accentColor: string;
    inputClass: string;
    iconColor: string;
  };
}

export enum StyleCategory {
  LUXURY = '轻奢风格',
  SOFT = '柔和温暖',
  TECH = '科技深色',
  APPLE = '果系设计',
  CREATIVE = '创意自然',
  VIBRANT = '高能色彩'
}
