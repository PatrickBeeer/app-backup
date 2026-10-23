export interface TitleVariant {
  style: string;
  content: string;
}

export interface PlatformData {
  platformName: 'Douyin' | 'Xiaohongshu' | 'VideoAccount';
  titles: TitleVariant[];
  tags: string[];
}

export interface AnalysisResponse {
  platforms: PlatformData[];
}

