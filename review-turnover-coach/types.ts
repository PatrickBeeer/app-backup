export interface GenerationRequest {
  reviewText: string;
  productInfo: string;
  issueType: IssueType;
  toneModifier?: ToneModifier;
  language: Language;
}

export enum Language {
  ZH = 'zh-CN',
  EN = 'en-US',
  JP = 'ja-JP',
}

export enum IssueType {
  QUALITY = 'Product Quality',
  LOGISTICS = 'Logistics/Shipping',
  SERVICE = 'Customer Service',
  MISUNDERSTANDING = 'User Misunderstanding',
  OTHER = 'General/Other'
}

export enum ToneModifier {
  FRIENDLY = 'Friendly & Patient (Default)',
  MORE_EMPATHETIC = 'Deeply Emathetic',
  MORE_FACTUAL = 'Rational & Clear',
  COMPENSATION_FOCUSED = 'Active Compensation'
}

export interface GenerationResponse {
  reply: string;
  analysis: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  request: GenerationRequest;
  response: GenerationResponse;
}
