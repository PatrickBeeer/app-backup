import { generateContent, extractJsonTextFromResponse, extractTextFromResponse } from '../../../shared_services/geminiProxyService';

type ExtractedStyleDNA = {
  prompt: string;
  primaryColor: string;
  theme: string;
  borderRadius: string;
  glassEffect: boolean;
  shadow: string;
};

export async function generateNewStyle(baseConcept: string) {
  try {
    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      tier: 'normal',
      systemInstruction: {
        parts: [{ text: '你是一个专家级提示词工程师。请务必使用中文生成高质量、专业且技术准确的 UI 设计指令，描述必须详尽且富有美感。' }],
      },
      contents: {
        parts: [{ text: `基于此概念创建 UI 提示词："${baseConcept}"。包含背景、容器、排版、交互。` }],
      },
    });
    const text = extractTextFromResponse(response);
    return text || "";
  } catch (error) {
    return "生成失败。";
  }
}

export async function extractStyleFromImage(base64Data: string, mimeType: string) {
  try {
    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      tier: 'normal',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { text: `请深入分析这张 UI 参考图，提取其视觉 DNA 并以 JSON 格式返回。
          
注意：prompt 字段必须使用中文编写极其详尽且专业的设计指令。为了确保用户复制到 Google AI Studio 时能精准还原，描述必须严格遵循以下结构：

【设计指令结构】：
1. 风格定义句：请为我设计一个具备‘[风格名称]’质感的 Web 应用。
2. 全局审美规范（分点描述）：
   - 背景氛围：描述色彩、渐变方式、底色值。
   - 容器材质：描述圆角曲率、透明度、背景模糊(Backdrop Blur)级别、边框粗细与颜色。
   - 阴影系统：描述阴影的扩散半径、颜色倾向、悬浮感级别。
   - 排版层次：描述字体建议、字重、标题与正文的色彩对比、字间距处理。
   - 交互体验：描述按钮形状、悬停(Hover)动效、聚焦反馈。
   - 装饰细节：描述图标风格、留白比例、特殊的点缀元素。

JSON 必须包含：
1. prompt (上述结构化的详细中文提示词)
2. primaryColor (提取最显著的品牌色十六进制)
3. theme (根据明度判断为 dark 或 light)
4. borderRadius (根据观察判断为 none, md, xl, full 选一)
5. glassEffect (判断是否有毛玻璃/透明效果，boolean)
6. shadow (判断投影强度为 none, soft, hard 选一)` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            primaryColor: { type: 'string' },
            theme: { type: 'string' },
            borderRadius: { type: 'string' },
            glassEffect: { type: 'boolean' },
            shadow: { type: 'string' },
          },
          required: ["prompt", "primaryColor", "theme", "borderRadius", "glassEffect", "shadow"]
        }
      }
    });
    const jsonText = extractJsonTextFromResponse(response);
    return JSON.parse(jsonText) as ExtractedStyleDNA;
  } catch (error) {
    console.error("Gemini Image API Error:", error);
    return null;
  }
}
