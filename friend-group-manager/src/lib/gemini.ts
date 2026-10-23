import { extractJsonTextFromResponse, generateContent } from '@/services/geminiProxyService';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VIDEO_MODEL = 'veo_3_1';

void IMAGE_MODEL;
void VIDEO_MODEL;

export interface StyleProfile {
  tone: string;
  layout: string;
  emojis: string;
  persona: string;
}

export async function extractStyle(pastPosts: string): Promise<StyleProfile> {
  const instructions = `
你是一个顶尖的社交媒体文案专家和心理学大师。
请分析用户提供的以往朋友圈文案，从以下4个维度深度解析其个人文风，并以JSON格式返回：
1. tone (表达语气): 如幽默自嘲、文艺抒情、干练直接、碎碎念、情绪化等
2. layout (标点与排版): 如爱用波浪号~、不用句号、喜欢频繁换行、爱用括号吐槽等
3. emojis (Emoji偏好): 如极简无表情、爱用特定表情、句末习惯带表情等
4. persona (核心人设): 如靠谱职场人、热爱生活的吃货、努力上进的学生党等
`;

  try {
    const response = await generateContent({
      model: TEXT_MODEL,
      task: 'text_gen',
      contents: {
        parts: [{ text: pastPosts }],
      },
      systemInstruction: {
        parts: [{ text: instructions }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: 'object',
          properties: {
            tone: { type: 'string' },
            layout: { type: 'string' },
            emojis: { type: 'string' },
            persona: { type: 'string' },
          },
          required: ["tone", "layout", "emojis", "persona"],
        },
      },
    });

    return JSON.parse(extractJsonTextFromResponse(response)) as StyleProfile;
  } catch (error) {
    console.error("Error extracting style:", error);
    throw error;
  }
}

export async function generateCopy(
  profile: StyleProfile,
  scenario: string,
  topic: string,
  length: 'short' | 'long' | 'auto' = 'auto'
): Promise<string[]> {
  let lengthInstruction = "单条文案控制在 30-150 字以内最佳。";
  if (length === 'short') {
    lengthInstruction = "单条文案尽量简短有力，控制在 10-50 字以内。";
  } else if (length === 'long') {
    lengthInstruction = "单条文案适合长篇思考或走心分享，字数在 150-300 字以上。";
  }

  const instructions = `
你是一个顶尖的社交媒体文案专家和心理学大师。你拥有强大的“文风克隆”能力。
你的任务是根据用户的【专属文风档案】和他们提供的【当次主题】，为他们生成朋友圈文案。

【专属文风档案】
- 表达语气: ${profile.tone}
- 标点与排版: ${profile.layout}
- Emoji偏好: ${profile.emojis}
- 核心人设: ${profile.persona}

【当前场景】: ${scenario}
场景策略要求：
- 日常生活：主打情绪共鸣与松弛感，拒绝流水账。
- 工作职场：主打专业、靠谱且不呆板，晒成绩而不炫耀，谈辛苦而不抱怨。
- 学习成长：主打通透、内驱力与启发，体现成长感，切忌说教味。
- 产品种草/安利：主打提供价值、润物无声，从真实体验出发，切忌微商风和压迫感。

【黄金法则】
1. 绝对去AI化: 严禁使用“总而言之、在这快节奏的时代、不仅...而且、探讨、旨在”等典型AI词汇。
2. 字数控制: ${lengthInstruction}
3. 灵活留白: 适当位置用括号提示用户补全信息，如：（这里加上一张你喝咖啡的照片）。

【输出格式要求】
请直接提供 3 个不同切入点（如：极简高冷版、幽默自嘲版、真诚走心版）的文案选项。
请以JSON数组格式返回，每个元素是一个字符串，即该条文案的具体内容。不要包含多余的说明文字。
`;

  try {
    const response = await generateContent({
      model: TEXT_MODEL,
      task: 'text_gen',
      contents: {
        parts: [{ text: topic }],
      },
      systemInstruction: {
        parts: [{ text: instructions }],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    });

    return JSON.parse(extractJsonTextFromResponse(response)) as string[];
  } catch (error) {
    console.error("Error generating copy:", error);
    throw error;
  }
}
