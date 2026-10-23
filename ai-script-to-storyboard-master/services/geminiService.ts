import { generateContent, extractJsonTextFromResponse, extractTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { Shot, AspectRatio, AnalysisResult } from '../types';

// Enhanced System Instruction for Consistency and Cinematic Logic
const ENHANCED_DIRECTOR_INSTRUCTION = `
你是一个专业的"AI影视共创分镜助手"，具备导演级的电影视觉理解、摄影语言表达与艺术风格控制能力。
任务：根据用户脚本生成静态分镜列表。

**核心指令：一致性与连贯性 (CONSISTENCY IS KING)**

1. **视觉锚点 (Visual Anchors) - 必须严格执行**：
   - **角色一致性**：在生成分镜前，必须在逻辑内部定义每个角色的"绝对视觉特征"（必须包含：性别、年龄、种族、发型、衣着颜色与款式）。
     - *错误示范*："User A looks at..."
     - *正确示范*："A 25-year-old Japanese woman with long straight black hair wearing a red hoodie looks at..."
   - **强制植入**：在编写每个镜头的 \`mjPrompt\` 时，**必须逐字包含**该角色的完整视觉特征描述。不要简化，不要使用代词。
   - **场景一致性**：定义环境的固定视觉特征（光源、色调、关键道具），并在同一场景的所有镜头中重复此描述。

2. **人物关系与空间逻辑 (SPATIAL LOGIC FIXES)**：
   - **轴线原则**：如果镜头1是 A (Looking Screen-Right)，镜头2必须是 B (Looking Screen-Left)。
   - **追逐场景 (Car Chase)**：
     - **严禁**描述为模糊的"Chasing"。
     - **必须**明确方向一致性： "Car A is behind Car B, both moving towards screen-right fast".
     - 必须强调 "Side view" 或 "Rear view" 以避免AI生成对撞画面。
   - **车内双人 (Two People in Car)**：
     - **严禁**模糊描述 "Two people in car"。
     - **必须**分离座位： "Character A sitting in driver seat (Left), Character B sitting in passenger seat (Right)".
     - 必须强调 "Distinct separate seats", "Distance between characters"。
   - **性别准确性**：Midjourney 提示词中必须包含 "man", "woman", "boy", "girl" 等明确性别词汇，严禁模棱两可。

3. **镜头语言 (Cinematic Language)**：
   - **景别**: Extreme Long Shot (环境), Medium Shot (叙事), Close-Up (情绪), OTS (过肩).
   - **构图**: Rule of Thirds, Center Framed, Negative Space, Low Angle (强势), High Angle (弱势).

4. **AI制片逻辑**：
   - **静态构图**：分镜是静止的。不要使用动态动词（如 "running"），请使用状态描述（如 "frozen in mid-stride", "pose of running"）。
   - **动态拆解**：大幅度动作拆分为 [Start Frame] 和 [End Frame]。

5. **输出结构 (JSON)**：
   - \`mjPrompt\` 结构公式（权重由高到低）：
     **[全套角色锚点描述] + [全套环境锚点描述] + [空间位置明确描述] + [镜头参数] + [光影氛围] + [风格]**
   - \`cnPrompt\`：中文导演视角的描述，包含色彩心理学和情绪隐喻。
`;

export const generateScriptFromIdea = async (idea: string): Promise<string> => {
  try {
    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      billing_task: 'text_gen',
      contents: {
        parts: [{ text: `请根据以下简短的创意或主题，编写一段电影剧本。剧本应包含场景描述、人物动作和对白。
      
      创意/主题: ${idea}
      
      要求：
      1. 格式清晰，适合分镜分析。
      2. 长度适中（约 3-6 个关键场景）。
      3. 语言富有画面感。` }]
      },
      config: {
        temperature: 0.7,
      }
    });
    
    const text = extractTextFromResponse(response);
    return text || "";
  } catch (error) {
    console.error("Error generating script:", error);
    throw new Error("无法生成剧本，请检查网络设置后重试。");
  }
};

export const analyzeScriptToShots = async (script: string, panelCount: number): Promise<AnalysisResult> => {
  // Define strict output schema
  const responseSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "integer" },
        description: { type: "string" },
        composition: { type: "string" },
        camera: { type: "string" },
        lighting: { type: "string" },
        mood: { type: "string" },
        type: { type: "string", enum: ["独立镜头", "首帧", "尾帧", "正反打"] },
        mjPrompt: { type: "string", description: "Full descriptive prompt. MUST specify 'left seat'/'right seat' for car interiors. MUST specify 'moving same direction' for chases." },
        cnPrompt: { type: "string" },
        sdParams: { type: "string" },
      },
      required: ["id", "description", "composition", "camera", "lighting", "mood", "type", "mjPrompt", "cnPrompt"],
    },
  };

  const countInstruction = panelCount > 0 
    ? `Strictly split into ${panelCount} shots.` 
    : "Decide shot count based on narrative pacing.";

  try {
    // Using gemini-3-flash-preview for complex reasoning and strict format adherence
    const response = await generateContent({
      model: 'gemini-3-flash-preview', 
      task: 'text_gen',
      billing_task: 'text_gen',
      contents: {
        parts: [{ text: `Script Content:\n${script}\n\nTask: Analyze script and generate consistent storyboard shots. First, identify character/environment anchors internally, then apply them to EVERY prompt.` }]
      },
      systemInstruction: {
        parts: [{ text: `${ENHANCED_DIRECTOR_INSTRUCTION}\n\n${countInstruction}` }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, // Lower temperature to enforce strict adherence to anchors
      }
    });

    const jsonText = extractJsonTextFromResponse(response);
    let shots: Shot[] = [];
    
    try {
        shots = JSON.parse(jsonText) as Shot[];
    } catch (parseError) {
        console.error("JSON Parse Failed:", jsonText);
        throw new Error("模型返回的数据格式异常，请重试。");
    }

    // Note: Token usage is not available from proxy service response
    // Return default values
    return {
      shots,
      usage: {
        inputTokens: 0,
        outputTokens: 0
      }
    };
  } catch (error) {
    console.error("Error analyzing script:", error);
    throw error;
  }
};

export const generateShotImage = async (shot: Shot, aspectRatio: AspectRatio, seed?: number): Promise<string> => {
  // Optimized Prompt Wrapper for Image Generation
  // 1. Injects explicit NEGATIVE prompts to fix common logic errors (head-on cars, merged bodies).
  // 2. Uses the seed to ensure variation on retry.
  const visualPrompt = `
    professional movie storyboard sketch, masterpiece, intricate details, 
    (rough pencil sketch style:1.3), (black and white charcoal:1.2), 
    
    CONTENT DESCRIPTION:
    ${shot.mjPrompt}
    
    STYLE & TECHNIQUE:
    expressive lines, dramatic lighting, high contrast, cinematic composition, rule of thirds.
    
    NEGATIVE PROMPT / AVOID:
    (text:1.5), (color:1.2), (watermark), (blurred faces), (frames), (speech bubbles),
    (cars facing each other:1.5), (head-on collision:1.5), (traffic accident style:1.2),
    (two people in one seat:1.5), (merged bodies:1.5), (overlapping characters:1.4), (bad anatomy:1.2).
  `;

  const effectiveSeed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
  
  try {
    const response = await generateContent({
      model: 'gemini-3.1-flash-image-preview', 
      task: 'image_gen',
      billing_task: 'image_gen',
      contents: {
        parts: [{ text: visualPrompt }]
      },
      config: {
        seed: effectiveSeed,
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      }
    });

    const imageUrl = extractImageFromResponse(response);
    if (!imageUrl) {
      throw new Error("No image data found in response");
    }
    
    return imageUrl;
  } catch (error: any) {
    console.error(`Error generating image for shot ${shot.id}:`, error);
    throw error;
  }
};

