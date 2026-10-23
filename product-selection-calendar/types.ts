export interface ProductRecommendation {
  name: string;
  brand?: string;
  volume?: string;
  price: string;
  audience: string;
}

export interface DayData {
  day: number;
  lunarDate: string;
  theme: string;
  isHoliday?: boolean;
  holidayName?: string;
  recommendation?: ProductRecommendation;
}

export interface MonthData {
  id: number;
  name: string;
  year: number;
  days: DayData[];
  holidays: { name: string; date: string; lastYear: string }[];
  goldenScripts: string[];
  selectionDirections: string[];
}

export interface MarketingStrategyResult {
  painPoints: string[];
  sellingPoints: string[];
  keywords: {
    traffic: string[];
    content: string[];
    longTail: string[];
  };
  operationsChecklist: string[];
  videoScript: {
    hook: string;
    body: string;
    cta: string;
  };
}
