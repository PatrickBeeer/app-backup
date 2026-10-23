/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ProductAnalysis {
  name: string;
  category: string;
  features: string[];
  sellingPoints: string[];
  description: string;
  visualDescription: string; // Added to capture precise visual details (shape, material, texture, etc.)
  xiaohongshuTrends?: {
    influencerStyle: string;
    sellerStyle: string;
  };
}

export interface CopySuggestion {
  titles: string[];
  content: string;
  tags: string[];
  vibe: 'cute' | 'professional' | 'lifestyle' | 'minimalist';
}

export interface VisualStyleSuggestion {
  id: string;
  name: string;
  description: string;
  scenePrompt: string;
  thumbnail?: string;
  customPrompt?: string; // For user custom editing
}

export interface AppState {
  originalImage: string | null;
  referenceText: string;
  coreSellingPoints: string;
  analysis: ProductAnalysis | null;
  copySuggestions: CopySuggestion[];
  styleSuggestions: VisualStyleSuggestion[];
  isAnalyzing: boolean;
  isGeneratingCopy: boolean;
  isGeneratingStyles: boolean;
}
