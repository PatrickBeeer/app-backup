// JSON Schemas for Gemini structured output, ported from backend/app/schemas/domain.py.
// Uses @google/genai Type so they can be passed straight to config.responseSchema.

import { Type } from '@google/genai';

const insightSectionSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['summary', 'evidence'],
};

const demandItemSchema = {
  type: Type.OBJECT,
  properties: {
    need: { type: Type.STRING },
    frequency: { type: Type.INTEGER },
    examples: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['need', 'frequency', 'examples'],
};

export const analysisReportSchema = {
  type: Type.OBJECT,
  properties: {
    viral_reasons: insightSectionSchema,
    user_pains: insightSectionSchema,
    content_structure: insightSectionSchema,
    title_formula: insightSectionSchema,
    cover_visual: insightSectionSchema,
    comment_demands: { type: Type.ARRAY, items: demandItemSchema },
    limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER },
  },
  required: [
    'viral_reasons',
    'user_pains',
    'content_structure',
    'title_formula',
    'cover_visual',
    'comment_demands',
    'limitations',
    'confidence',
  ],
};

export const insightSectionOnlySchema = insightSectionSchema;

export const coverPlanSchema = {
  type: Type.OBJECT,
  properties: {
    cover_type: {
      type: Type.STRING,
      enum: [
        'text_only',
        'landscape_text',
        'person_text',
        'product_text',
        'food_text',
        'space_text',
        'other_photo_text',
      ],
    },
    subject: { type: Type.STRING },
    composition: { type: Type.STRING },
    palette: { type: Type.STRING },
    title_position: { type: Type.STRING },
    visual_style: { type: Type.STRING },
    typography_symbols: { type: Type.ARRAY, items: { type: Type.STRING } },
    emphasis_method: { type: Type.STRING },
    line_break_pattern: { type: Type.STRING },
  },
  required: [
    'cover_type',
    'subject',
    'composition',
    'palette',
    'title_position',
    'visual_style',
    'typography_symbols',
    'emphasis_method',
    'line_break_pattern',
  ],
};

const videoShotSchema = {
  type: Type.OBJECT,
  properties: {
    duration: { type: Type.STRING },
    visual: { type: Type.STRING },
    narration: { type: Type.STRING },
    subtitle: { type: Type.STRING },
  },
  required: ['duration', 'visual', 'narration', 'subtitle'],
};

export const generatedCopySchema = {
  type: Type.OBJECT,
  properties: {
    body: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    // Nullable: null for image notes, 6–10 shots for video notes.
    video_script: { type: Type.ARRAY, items: videoShotSchema, nullable: true },
  },
  required: ['body', 'tags', 'video_script'],
};

export const titlesSchema = {
  type: Type.OBJECT,
  properties: {
    titles: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['titles'],
};
