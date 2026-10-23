export type Language = 'zh';

export type ModelAge = '0-1岁' | '1-3岁' | '3-5岁' | '5-7岁' | '7-12岁' | '12岁+';

export type ToyCategory = '积木玩具' | '娃娃和玩偶' | '益智玩具' | '遥控玩具' | '毛绒玩具' | '户外玩具' | '其他';

export type AspectRatio = '1:1' | '3:4' | '9:16';

export interface ToyAnalysis {
  name: string;
  description: string;
  features: string[];
  ageRange: string;
  category: ToyCategory;
}

