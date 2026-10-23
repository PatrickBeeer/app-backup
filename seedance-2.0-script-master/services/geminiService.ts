
import { generateContent, extractTextFromResponse } from '../../../shared_services/geminiProxyService';

export type VideoStyle = 'PROFESSIONAL' | 'KOC_HIGH_ENERGY' | 'PLOT_TWIST' | 'KNOWLEDGE_SHARING';

const STYLE_PROMPTS = {
  PROFESSIONAL: `
【电影感广告片风格】
核心逻辑：利用 Seedance 2.0 的高级能力（慢动作、微距、平滑运镜）营造奢华感与高级质感。
脚本结构（15s）：
- 【0-3s】视觉钩子：利用慢动作表现产品最爽、最解压或最核心的动态瞬间（如液体飞溅、物体回弹）。
- 【3-8s】感官细节：极近距离微距镜头，缓慢扫过产品的关键材质细节（纹理、颗粒、光泽），展现细腻质感。
- 【8-12s】向往场景：中远景镜头，摄影机缓慢向后拉（Dolly Out），将产品置于一个理想化、高级的使用环境中。
- 【12-15s】静态转化：干净稳定的全景展示，构图平衡，背景简洁，为后期留白。
视觉标准：提示词必须包含“慢动作特写”、“极致微距”、“平滑后拉运镜”等中文描述。
`,
  KOC_HIGH_ENERGY: `
【真人场景带货风格】
核心逻辑：一分段快节奏、高饱和度、极具真实感的种草短视频。强调真人出镜、对口型（Lip-sync）和强烈的即时感官刺激。
脚本结构（15s）：
- 【0-3s】真人引入（对口型）：中景镜头，真人主播形象面带兴奋且略带急切的表情直视镜头，展示产品包装并在镜头前晃动。嘴型与音频“想吃/想看XXX别点外卖/别等了！看这个！”完全同步。镜头带有些许手持摄影的真实晃动感。
- 【3-7s】视觉暴击（核心卖点）：特写镜头接极近距离微距。展示产品使用的爽点瞬间（如丢入锅中翻滚、拆封瞬间、油脂化开、热气腾腾），画面极具冲击力。
- 【7-12s】真人交互（感官刺激，对口型）：中近景镜头。主播展示真实使用/试吃/佩戴反应，表现出极致享受、被惊艳到的真实表情。嘴型与音频同步描述感官体验。
- 【12-15s】强力促单（对口型）：中景固定镜头。主播一手拿着产品，一手坚定指向左下角购物车，表情诚恳且紧迫，留出后期添加促销花字的空间。
视觉标准：色彩鲜艳、光泽感强、强调即时满足感、动作卡点精准，提示词全部使用中文。
`,
  PLOT_TWIST: `
【剧情反转风格】
核心逻辑：利用强烈的视觉或逻辑反差吸引用户停留，最后引出产品作为“终极解决方案”。
脚本结构（15s）：
- 【0-5s】制造悬念/痛点：展示一个尴尬、失败或令人困惑的日常场景（如：努力打扫却更脏、昂贵护肤品没效果）。镜头快速切换，营造紧张感。
- 【5-8s】神级反转：画面突然定格或黑屏一瞬，伴随清脆音效，产品以意想不到的方式切入画面。
- 【8-12s】爽点释放：展示产品如何瞬间解决之前的痛点。使用快节奏剪辑，配合 Seedance 2.0 的动态模糊或快速推近镜头。
- 【12-15s】品牌定格：产品在反差后的舒适环境里优雅展示，配合反转后的轻松台词。
视觉标准：强调光影对比、快节奏剪辑、夸张的表情或动作，提示词全部使用中文。
`,
  KNOWLEDGE_SHARING: `
【知识科普风格】
核心逻辑：以“专家”或“资深玩家”视角分享干货，建立信任感，自然植入产品。
脚本结构（15s）：
- 【0-3s】抛出问题：主播在专业背景下（如实验室、书房、工作室），直击用户痛点问题（如：为什么你的咖啡总是不够香？）。
- 【3-9s】干货拆解：利用 Seedance 2.0 的微距镜头展示产品内部结构、成分或原理。画面配合简洁的动态数据标注感。
- 【9-13s】实测对比：展示使用产品前后的客观差异。画面清晰、稳定，强调科学性与真实性。
- 【13-15s】总结建议：主播给出专业建议，产品作为核心推荐项出现在画面中央。
视觉标准：色调中性偏冷、光线均匀、构图严谨，提示词全部使用中文。
`
};

const SYSTEM_INSTRUCTION = `
你是一位顶尖的AI视频导演兼电商内容专家。你将根据用户选择的“视频风格”、上传的产品图（或名称）以及可选的要求，生成专业的15秒 Seedance 2.0 脚本。

关键逻辑：
1. **智能识别**：若无产品名称，请通过图片识别主体。
2. **风格对齐**：根据用户选择的风格，严格执行对应的脚本结构。
3. **中文提示词**：为每个场景生成专业的 Seedance 2.0 提示词，**必须全部使用中文描述**。
4. **易读性优化**：不要使用表格。请使用清晰的“场景块”格式输出，每个场景之间空一行。

最终输出格式示例：

### 🎬 场景 1：[时间段]
**画面内容**：[详细描述]
**Seedance 2.0 提示词**：[中文提示词，多个词用逗号隔开]
**音频/台词**：[具体台词或音效描述]

---

### 🎬 场景 2：[时间段]
... (以此类推)
`;

export const generateVideoScript = async (
  productName: string, 
  imageBase64?: string, 
  requirements?: string,
  style: VideoStyle = 'PROFESSIONAL'
): Promise<string> => {
  try {
    const promptText = `
    当前选定风格：${STYLE_PROMPTS[style]}
    ${productName ? `产品名称: ${productName}` : '请通过图片识别产品并命名'}
    ${requirements ? `用户个性化要求（如台词、模特性别、特定环境）: ${requirements}` : ''}
    `;

    const parts: any[] = [{ text: promptText }];
    
    if (imageBase64) {
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      });
    }

    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      contents: { parts },
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      config: {
        temperature: 0.75,
      },
    });

    return extractTextFromResponse(response) || "生成失败，请稍后重试。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("脚本生成失败，请检查网络或图片。");
  }
};
