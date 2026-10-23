import { extractImageFromResponse, generateContent } from '../../../../shared_services/geminiProxyService';
import { buildDesignPrompt, buildRenderPrompt, type WallProject } from '../shared/wall';

export type WallGenerationStage = 'design' | 'render';

type UploadAsset = {
  name: string;
  dataUrl: string;
};

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function readEnv(name: string): string | undefined {
  const viteEnv =
    typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, string> }).env : undefined;
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  return viteEnv?.[name] || processEnv?.[name];
}

function stripDataUrlPrefix(input: string): string {
  return String(input || '').replace(/^data:[^;]+;base64,/i, '');
}

function detectMimeType(input: string, fallback = 'image/png'): string {
  const match = String(input || '').match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
}

function toInlineDataPart(image: UploadAsset | string): { inlineData: { mimeType: string; data: string } } {
  const dataUrl = typeof image === 'string' ? image : image.dataUrl;
  return {
    inlineData: {
      mimeType: detectMimeType(dataUrl),
      data: stripDataUrlPrefix(dataUrl)
    }
  };
}

function getPrompt(project: WallProject, stage: WallGenerationStage, hasStyleReference: boolean): string {
  if (stage === 'design') {
    return buildDesignPrompt(project, {
      source: 'uploaded-structure',
      hasStyleReference
    });
  }

  return buildRenderPrompt(project, {
    source: 'approved-design',
    hasStyleReference
  });
}

function buildSystemInstruction(stage: WallGenerationStage): string {
  if (stage === 'design') {
    return [
      'You create commercially usable wall-display elevation graphics.',
      'When the first image is a measured wall structure drawing, preserve its geometry, openings, and blank physical cutouts exactly.',
      'When a second image is provided, use it only as the visual style reference.',
      'Return only the generated image result.'
    ].join(' ');
  }

  return [
    'You create photorealistic wall-display showroom renderings.',
    'The first image is the user-approved flat design and is the layout and color source of truth.',
    'Preserve its structure, openings, placement, and palette while adding only realistic material, depth, lighting, and space context.',
    'Return only the generated image result.'
  ].join(' ');
}

export async function generateWallImage(
  project: WallProject,
  stage: WallGenerationStage,
  images: Array<UploadAsset | string>
): Promise<string> {
  const prompt = getPrompt(project, stage, stage === 'design' && images.length > 1);
  const imageParts = images.map((image) => toInlineDataPart(image));
  const response = await generateContent({
    model: readEnv('VITE_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL,
    task: 'image_gen',
    billing_task: 'image_gen',
    contents: {
      parts: [...imageParts, { text: prompt }]
    },
    systemInstruction: {
      parts: [
        {
          text: buildSystemInstruction(stage)
        }
      ]
    }
  });

  const image = extractImageFromResponse(response);
  if (!image) {
    throw new Error('AI image generation returned no image.');
  }
  return image;
}
