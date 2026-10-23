import { PromptResponse, Platform, VideoPlatform } from "../types";
import { generateContent, extractJsonTextFromResponse, extractTextFromResponse } from "../../../shared_services/geminiProxyService";

const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableGenerationError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  if (!message) {
    return false;
  }

  const isDeterministicImageInputError = [
    'unable to process input image',
    'invalid image',
    'corrupted image',
    'unsupported image',
    'malformed image',
  ].some((needle) => message.includes(needle));

  if (isDeterministicImageInputError) {
    return false;
  }

  return [
    '429',
    '500',
    '502',
    '503',
    '504',
    'timeout',
    'network',
    'fetch',
    'gateway',
    'upstream',
    'temporarily',
    'service unavailable',
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(factory: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= MAX_RETRY_ATTEMPTS || !isRetryableGenerationError(error)) {
        break;
      }

      const waitMs = BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function parseJsonLoose<T>(rawText: string): T {
  const normalized = rawText.replace(/^\uFEFF/, '').trim();
  const unfenced = normalized
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(unfenced) as T;
}

async function generateStructuredJson<T>(request: Parameters<typeof generateContent>[0]): Promise<T> {
  const response = await withRetry(() => generateContent(request));

  try {
    return JSON.parse(extractJsonTextFromResponse(response)) as T;
  } catch {
    return parseJsonLoose<T>(extractTextFromResponse(response));
  }
}

async function generateImageAnalysisJson(base64Image: string, systemInstruction: any): Promise<PromptResponse> {
  const imagePart = {
    inlineData: { mimeType: getMimeType(base64Image), data: cleanBase64(base64Image) },
  };

  const strictTextPart = { text: "Analyze this image acting as the Visual Director. Deconstruct it and generate the required JSON response." };

  try {
    return await generateStructuredJson<PromptResponse>({
      model: GEMINI_TEXT_MODEL,
      task: 'text_gen',
      contents: { parts: [imagePart, strictTextPart] },
      systemInstruction,
      config: {
        responseMimeType: "application/json",
        responseSchema: buildImageAnalysisSchema(),
        temperature: 0.5,
      },
    });
  } catch (strictError) {
    const fallbackTextPart = {
      text: "Analyze this image as a visual director and return ONLY JSON with keys: midjourneyPrompt, mjTips, jimengPrompt, promptAnalysis, recommendedPlatform, detectedAspectRatio.",
    };

    const fallback = await generateStructuredJson<PromptResponse>({
      model: GEMINI_TEXT_MODEL,
      task: 'text_gen',
      contents: { parts: [imagePart, fallbackTextPart] },
      systemInstruction,
      config: {
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    if (!fallback.midjourneyPrompt || !fallback.jimengPrompt || !fallback.promptAnalysis) {
      throw strictError;
    }

    return fallback;
  }
}

const ROLE_PROFILE = {
  role: "Visual Director & AI Prompt Expert",
  experience: "10+ years in Cinematography, Photography, and AI Generative Art",
  core_philosophy: {
    concept: "Concretization (具象化)",
    rule: "Transform abstract adjectives into specific visual elements (lighting, texture, composition).",
    formula: "[Subject] + [Environment] + [Action] + [Composition] + [Lighting] + [Style]"
  },
};

const buildTextSchema = (platform: Platform) => {
  const properties: Record<string, { type: string; description: string }> = {
    promptAnalysis: { type: "string", description: "Director's Rationale: Why these specific visual elements were chosen." },
  };
  const required: string[] = ['promptAnalysis'];
  if (platform === 'all' || platform === 'midjourney') {
    properties.midjourneyPrompt = { type: "string", description: "Photorealistic English prompt. Include specific camera terms." };
    properties.mjTips = { type: "string", description: "Render parameters for V7. Include --cref/--sref advice. DO NOT include --cw." };
    required.push('midjourneyPrompt', 'mjTips');
  }
  if (platform === 'all' || platform === 'jimeng') {
    properties.jimengPrompt = { type: "string", description: "Chinese director-style prompt. Concrete visuals." };
    required.push('jimengPrompt');
  }
  return { type: "object" as const, properties, required };
};

const buildVideoSchema = (platform: VideoPlatform) => {
  const properties: Record<string, { type: string; description: string }> = {
    promptAnalysis: { type: "string", description: "Director's Rationale for motion/visual elements." },
  };
  const required: string[] = ['promptAnalysis'];
  if (platform === 'all' || platform === 'veo') {
    properties.veoPrompt = { type: "string", description: "English prompt for Google Veo. Start with 'A cinematic shot of...'." };
    required.push('veoPrompt');
  }
  if (platform === 'all' || platform === 'jimeng_video') {
    properties.jimengVideoPrompt = { type: "string", description: "Chinese prompt for Jimeng Video. Focus on camera movement." };
    required.push('jimengVideoPrompt');
  }
  if (platform === 'all' || platform === 'hailuo') {
    properties.hailuoPrompt = { type: "string", description: "Chinese prompt for Hailuo. MUST append [Camera] tags at the end." };
    required.push('hailuoPrompt');
  }
  return { type: "object" as const, properties, required };
};

const buildJsonSchema = () => ({
  type: "object" as const,
  properties: {
    jsonSystemPrompt: { type: "string", description: "The complete JSON System Prompt for LLMs." },
    promptAnalysis: { type: "string", description: "Brief rationale." },
  },
  required: ['jsonSystemPrompt', 'promptAnalysis'],
});

const buildImageAnalysisSchema = () => ({
  type: "object" as const,
  properties: {
    midjourneyPrompt: { type: "string", description: "Photorealistic English prompt." },
    mjTips: { type: "string", description: "MJ V7 render parameters." },
    jimengPrompt: { type: "string", description: "Chinese director-style prompt." },
    promptAnalysis: { type: "string", description: "Director's Rationale." },
    recommendedPlatform: { type: "string", description: "Recommended platform." },
    detectedAspectRatio: { type: "string", description: "Estimated aspect ratio." },
  },
  required: ['midjourneyPrompt', 'mjTips', 'jimengPrompt', 'promptAnalysis', 'recommendedPlatform', 'detectedAspectRatio'],
});

export const generateArtPrompts = async (userInput: string, platform: Platform = 'all'): Promise<PromptResponse> => {
  const systemContext = {
    profile: ROLE_PROFILE,
    task: "Generate Image Prompts from Text Input",
    rules: {},
    output_rules: { instruction: "Output valid JSON matching the schema.", schema_enforcement: "Output must be valid JSON." },
  };
  return generateStructuredJson<PromptResponse>({
    model: GEMINI_TEXT_MODEL,
    task: 'text_gen',
    contents: { parts: [{ text: userInput }] },
    systemInstruction: systemContext,
    config: {
      responseMimeType: "application/json",
      responseSchema: buildTextSchema(platform),
      temperature: 0.75,
    },
  });
};

export const generateVideoPrompts = async (
  userInput: string,
  startImageBase64: string | null,
  endImageBase64: string | null,
  platform: VideoPlatform = 'all'
): Promise<PromptResponse> => {
  const systemContext = {
    profile: ROLE_PROFILE,
    task: "Generate Video Prompts (Image-to-Video Focus)",
    rules: {},
    output_rules: { instruction: "Output valid JSON.", schema_enforcement: "Output must be valid JSON." },
  };
  const parts: any[] = [];
  if (startImageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: startImageBase64.split(',')[1] || startImageBase64,
      },
    });
  }
  if (endImageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: endImageBase64.split(',')[1] || endImageBase64,
      },
    });
  }
  let promptText = `Acting as a Visual Director, analyze the input. `;
  if (startImageBase64 && endImageBase64) {
    promptText += `User provided START FRAME and END FRAME. Intent: "${userInput}". Create prompts for the visual bridge/transition.`;
  } else if (startImageBase64) {
    promptText += `User provided START FRAME only. Intent: "${userInput}". Create prompts describing motion from this image.`;
  } else {
    promptText += `User provided Text Only. Intent: "${userInput}".`;
  }
  parts.push({ text: promptText });

  return generateStructuredJson<PromptResponse>({
    model: GEMINI_TEXT_MODEL,
    task: 'text_gen',
    contents: { parts },
    systemInstruction: systemContext,
    config: {
      responseMimeType: "application/json",
      responseSchema: buildVideoSchema(platform),
      temperature: 0.8,
    },
  });
};

export const generateJsonSystemPrompt = async (userInput: string): Promise<PromptResponse> => {
  const systemContext = {
    profile: "JSON Prompt Architect",
    task: {
      role: "JSON System Prompt Architect",
      objective: "Convert user intent into a strict JSON-formatted System Prompt for LLMs.",
      required_json_fields: { role: "", task: "", constraints: "", workflow: "", examples: "", output_format: "" },
      output_requirement: "The output field 'jsonSystemPrompt' MUST contain the generated JSON string.",
    },
    output_rules: { instruction: "Output valid JSON.", schema_enforcement: "Output must be valid JSON." },
  };
  return generateStructuredJson<PromptResponse>({
    model: GEMINI_TEXT_MODEL,
    task: 'text_gen',
    contents: { parts: [{ text: `用户需求: ${userInput}\n请根据此需求，编写一个专业的 JSON System Prompt。` }] },
    systemInstruction: systemContext,
    config: {
      responseMimeType: "application/json",
      responseSchema: buildJsonSchema(),
      temperature: 0.7,
    },
  });
};

const cleanBase64 = (b64: string) => b64.replace(/^data:[^;]+;base64,/, '');

const normalizeImageMimeType = (rawMimeType: string | undefined): string => {
  const mime = (rawMimeType || '').trim().toLowerCase();

  if (!mime) {
    return 'image/jpeg';
  }

  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg') {
    return 'image/jpeg';
  }

  if (mime === 'image/png' || mime === 'image/webp') {
    return mime;
  }

  throw new Error('仅支持 PNG/JPEG/WEBP 图片格式进行分析');
};

const getMimeType = (b64: string): string => {
  const m = b64.match(/^data:([^;]+);base64,/i);
  return normalizeImageMimeType(m?.[1]);
};

export const generatePromptsFromImage = async (base64Image: string): Promise<PromptResponse> => {
  const systemContext = {
    profile: ROLE_PROFILE,
    task: { task_type: "Image Reverse Engineering", steps: ["Analyze Shot Scale & Angle", "Analyze Lighting", "Detect Cultural Elements", "TEXT EXTRACTION if found."], platform_recommendation_logic: {} },
    rules: {},
    output_rules: { instruction: "Output valid JSON.", schema_enforcement: "Output must be valid JSON." },
  };
  return generateImageAnalysisJson(base64Image, systemContext as any);
}
