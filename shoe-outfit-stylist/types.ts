export type GenerationType = '上脚图' | '模特图' | '模特全身图';
export type ShoeCategory = '运动鞋' | '皮鞋' | '高跟鞋' | '靴子' | '凉鞋';
export type ShoeMaterial = '皮革' | '绒面' | '帆布' | '合成材料' | '橡胶';
export type ModelStyle = '街头潮酷' | '时尚优雅' | '日常休闲' | '运动活力' | '简约风格';
export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface ImageData {
    base64: string;
    mimeType: string;
}

export interface GenerationOptions {
    generationType: GenerationType;
    shoeCategory: ShoeCategory;
    shoeMaterial: ShoeMaterial;
    modelStyle: ModelStyle;
    aspectRatio: AspectRatio;
    customPrompt: string;
    seed: number;
}

