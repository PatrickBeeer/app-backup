import { AnalysisResponse } from "../types";
import { generateContent, extractJsonTextFromResponse } from "../../../shared_services/geminiProxyService";

const SYSTEM_INSTRUCTION = `
你是一位拥有5年短视频内容操盘经验的AI文案专家，擅长为抖音、小红书、视频号三个平台撰写高点击率、高搜索率、高分享力的短视频标题。你深度理解短视频平台算法推荐机制，能够结合目标用户的身份与内容偏好，生成具有转化力与传播力的标题+标签。

你拥有以下知识体系：
1️⃣ 三大平台用户画像与内容偏好
| 平台  | 主力人群                   | 内容偏好            | 推荐机制偏好      |
| --- | ---------------------- | --------------- | ----------- |
| 抖音  | 普通大众、电商老板、新手创业者        | 冲突感、爽感、钩子强、剧情感  | 情绪驱动 + 视频节奏 |
| 小红书 | 女性为主、白领、自由职业者、内容创作者    | 实用干货、关键词可搜、真实经验 | 搜索驱动 + 笔记结构 |
| 视频号 | 30+职场人、设计师、电商从业者、微信生态熟人圈用户 | 推荐信任、实际结果、身份带入感 | 社交裂变 + 私域传播 |

2️⃣ 平台爆款标题结构模板
| 平台  | 常用标题结构                  | 建议字数   | 标题类型偏好      |
| --- | ----------------------- | ------ | ----------- |
| 抖音  | 【动感动作】+【数据结果】+【钩子】      | 14-20字 | 冲突型、反转型、提问型 |
| 小红书 | 【类目/人设】+【工具/方法】+关键词     | 12-20字 | 搜索型、干货型、经验型 |
| 视频号 | 【用户身份】+【操作行为】+【推荐语气/结果】 | 18-24字 | 信任推荐型、实操转化型 |

3️⃣ 标题生成关键词库（自动调用）
平台类关键词：电商运营、脚本生成、爆款逻辑、详情页优化、AI剪辑
用户痛点类关键词：不会写、不会说、不涨粉、冷场、退货多、点击率低
工具/方法类关键词：AI脚本、数字人、选题模版、客服话术、智能工作流
情绪钩子类关键词：焦虑、淘汰、逆袭、太狠了、必须试试、月入破万
共鸣人群词：新手、老板、自由职业者、自媒体人、运营助理、店主

4️⃣ 风格类型与标题变体分类
你会输出每个平台3个风格不同的标题，并标注风格类型：
- 抖音: 冲突型, 数据型, 提问型
- 小红书: 干货型, 经验型, 搜索型
- 视频号: 推荐型, 实操型, 身份型

✅ 输出风格规范：
所有标题字数严格控制：抖音（不超过30个字符）、小红书（不超过20个字符）、视频号（18-24字）
风格之间有差异：冲突型更适合抖音，干货+搜索更适合小红书，社交推荐更适合视频号
不要机械复述逐字稿，要用"平台语言"重构为内容标题，标签优先匹配跟内容契合的热点话题，不要创造冷门词汇。
`;

// 定义响应 Schema（用于 JSON 模式）
const responseSchema = {
  type: "object",
  properties: {
    platforms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          platformName: {
            type: "string",
            enum: ['Douyin', 'Xiaohongshu', 'VideoAccount'],
            description: 'The platform identifier.'
          },
          titles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                style: { type: "string", description: 'The specific style type (e.g., 冲突型, 干货型)' },
                content: { type: "string", description: 'The generated title text. For Douyin: max 30 characters. For Xiaohongshu: max 20 characters.' }
              },
              required: ['style', 'content']
            }
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: 'Relevant hashtags for the platform'
          }
        },
        required: ['platformName', 'titles', 'tags']
      }
    }
  },
  required: ['platforms']
};

export const generateContentStrategy = async (script: string): Promise<AnalysisResponse> => {
  try {
    const response = await generateContent({
      model: 'gemini-3-flash-preview', // 纯文本任务，使用文本模型
      task: 'text_gen',
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Here is the user's verbatim script (逐字稿). Analyze it and generate titles/tags for Douyin, Xiaohongshu, and VideoAccount according to the system instructions.\n\nSCRIPT:\n${script}` }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.7,
      }
    });

    const jsonText = extractJsonTextFromResponse(response);
    if (!jsonText) {
      throw new Error("Empty response from AI");
    }

    const parsed = JSON.parse(jsonText);
    
    // 处理可能的响应格式（可能是 { platforms: [...] } 或直接是 platforms 数组）
    let result: AnalysisResponse;
    if (parsed.platforms) {
      result = parsed as AnalysisResponse;
    } else if (Array.isArray(parsed)) {
      result = { platforms: parsed } as AnalysisResponse;
    } else {
      result = parsed as AnalysisResponse;
    }

    // 应用标题长度限制
    result.platforms = result.platforms.map(platform => {
      const maxLength = platform.platformName === 'Douyin' ? 30 : 
                       platform.platformName === 'Xiaohongshu' ? 20 : 
                       Infinity; // 视频号保持原样
      
      return {
        ...platform,
        titles: platform.titles.map(title => ({
          ...title,
          content: title.content.length > maxLength 
            ? title.content.substring(0, maxLength) 
            : title.content
        }))
      };
    });
    
    return result;
  } catch (error: any) {
    console.error('生成内容策略失败:', error);
    throw error;
  }
};
