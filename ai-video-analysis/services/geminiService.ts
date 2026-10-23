import { generateContent, extractTextFromResponse, extractJsonTextFromResponse } from '../../../shared_services/geminiProxyService';
import { VideoAnalysis } from "../types";
import type { GeminiGenerateRequest } from '../../../shared_services/geminiProxyService';

const SYSTEM_INSTRUCTION = `你是一个顶尖的"短视频拆解专家"和"爆款短视频运营顾问"。
你会收到一组来自同一视频的顺序帧截图。

你的核心任务是进行"像素级拆解"：
1. **完整文案提取**：基于画面和语境，尽可能完整地还原视频的脚本、对白、旁白及核心视觉文字。
2. **像素级分镜拆解**：分析每一组画面的构图、运镜手法（如特写、推拉、跟拍）及剪辑节奏。
3. **商业/运营优化建议**：从自媒体（抖音/快手/小红书）或电商（淘宝/拼多多）转化的角度，给出深度优化策略。包括但不限于：黄金3秒钩子（Hook）优化、节奏点调整、CTA（行动号召）增强、情绪价值挖掘等。

请确保输出为结构化的 JSON。
`;

export const analyzeVideoFrames = async (
  frames: { data: string; mimeType: string }[],
  targetTopic?: string
): Promise<VideoAnalysis> => {
  try {
    let promptText = `请对这些视频帧进行深度拆解：
1. 请还原出完整的视频脚本/对白。
2. 拆解出每个关键镜头的分镜脚本（包括构图、灯光、情绪描述）。
3. 请作为"爆款导师"，从自媒体或电商转化的角度给出具体的优化建议，告诉用户如何修改能让播放量更高、转化更好。`;
    
    if (targetTopic && targetTopic.trim() !== "") {
      promptText += `\n\n【用户期望主题】：${targetTopic}`;
    }

    const imageParts = frames.map(f => ({
      inlineData: {
        mimeType: f.mimeType,
        data: f.data,
      },
    }));

    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      contents: [
        {
          role: 'user',
          parts: [
            ...imageParts,
            { text: promptText },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      }
    } as GeminiGenerateRequest);

    const jsonText = extractJsonTextFromResponse(response);
    console.log('[ai-video-analysis] ========== 开始解析响应 ==========');
    console.log('[ai-video-analysis] 步骤1: 提取的 JSON 文本长度:', jsonText?.length || 0);
    console.log('[ai-video-analysis] 步骤1: JSON 文本前 500 字符:', jsonText?.substring(0, 500) || '无内容');
    
    if (!jsonText) {
      throw new Error("AI 分析响应异常：未获取到文本内容");
    }

    // ========== 步骤2: 解析 JSON ==========
    let rawData: any;
    try {
      rawData = JSON.parse(jsonText);
      console.log('[ai-video-analysis] 步骤2: ✅ JSON 解析成功');
      console.log('[ai-video-analysis] 步骤2.1: rawData 类型:', typeof rawData);
      console.log('[ai-video-analysis] 步骤2.2: rawData 是否为数组:', Array.isArray(rawData));
      console.log('[ai-video-analysis] 步骤2.3: rawData 的键:', rawData ? Object.keys(rawData) : 'null');
      console.log('[ai-video-analysis] 步骤2.4: 完整 rawData:', JSON.stringify(rawData, null, 2));
    } catch (parseError) {
      console.error('[ai-video-analysis] 步骤2: ❌ JSON 解析失败:', parseError);
      console.error('[ai-video-analysis] 步骤2: 原始响应文本前 1000 字符:', jsonText.substring(0, 1000));
      throw new Error("AI 分析响应格式错误，无法解析 JSON");
    }
    
    // ========== 步骤3: 标准化数据结构 ==========
    // 处理数组格式：如果 rawData 是数组，取第一个元素
    let data: any = Array.isArray(rawData) ? rawData[0] : rawData;
    console.log('[ai-video-analysis] 步骤3: ✅ 标准化数据结构');
    console.log('[ai-video-analysis] 步骤3.1: data 类型:', typeof data);
    console.log('[ai-video-analysis] 步骤3.2: data 的键:', data ? Object.keys(data) : 'null');
    console.log('[ai-video-analysis] 步骤3.3: data 是否为数组:', Array.isArray(data));
    console.log('[ai-video-analysis] 步骤3.4: 完整 rawData:', JSON.stringify(rawData, null, 2));
    
    // 如果 data 有 video_analysis 字段，尝试展开（处理嵌套结构）
    if (data && data.video_analysis && typeof data.video_analysis === 'object') {
      console.log('[ai-video-analysis] 步骤3.5: 检测到嵌套 video_analysis，尝试展开');
      const videoAnalysis = data.video_analysis;
      console.log('[ai-video-analysis] 步骤3.5.1: video_analysis 的键:', Object.keys(videoAnalysis));
      console.log('[ai-video-analysis] 步骤3.5.2: video_analysis 内容:', JSON.stringify(videoAnalysis, null, 2));
      
      // 如果 data 只有 video_analysis 字段，直接使用 video_analysis 的内容
      const dataKeys = Object.keys(data);
      if (dataKeys.length === 1 && dataKeys[0] === 'video_analysis') {
        console.log('[ai-video-analysis] 步骤3.5.3: data 只有 video_analysis 字段，直接使用其内容');
        data = videoAnalysis;
      } else {
        // 否则合并 video_analysis 的内容到顶层
        console.log('[ai-video-analysis] 步骤3.5.3: data 有其他字段，合并 video_analysis 的内容到顶层');
        data = { ...data, ...videoAnalysis };
      }
      console.log('[ai-video-analysis] 步骤3.5.4: 展开后的 data 的键:', Object.keys(data));
    }

    // Some model responses wrap useful fields under video_analysis_report.
    if (data && data.video_analysis_report && typeof data.video_analysis_report === 'object') {
      console.log('[ai-video-analysis] 步骤3.5.5: 检测到 video_analysis_report，合并到顶层以便统一解析');
      data = { ...data, ...data.video_analysis_report };
      console.log('[ai-video-analysis] 步骤3.5.6: 合并后 data 的键:', Object.keys(data));
    }
    
    console.log('[ai-video-analysis] 步骤3.6: 最终 data 对象:', JSON.stringify(data, null, 2));
    
    // ========== 步骤4: 通用解析器 - 自动检测并提取数据 ==========
    console.log('[ai-video-analysis] 步骤4: ✅ 开始通用解析');
    console.log('[ai-video-analysis] 步骤4.1: data 的所有键:', Object.keys(data));

    const candidateObjects = [
      data,
      data?.analysis,
      data?.analysis_result,
      data?.result,
      data?.data,
      data?.output,
      data?.video_analysis,
      data?.video_analysis_report,
      data?.videoAnalysisReport,
      data?.video_overview,
      data?.script_restoration,
      data?.script_reconstruction,
    ].filter((item) => item && typeof item === 'object');

    const pickFirstString = (keys: string[]): string => {
      for (const obj of candidateObjects) {
        for (const key of keys) {
          const value = (obj as any)?.[key];
          if (typeof value === 'string' && value.trim()) {
            return value.trim();
          }
        }
      }
      return '';
    };

    const pickFirstArray = (keys: string[]): any[] => {
      for (const obj of candidateObjects) {
        for (const key of keys) {
          const value = (obj as any)?.[key];
          if (Array.isArray(value) && value.length > 0) {
            return value;
          }
        }
      }
      return [];
    };

    const pickFirstObject = (keys: string[]): Record<string, any> | null => {
      for (const obj of candidateObjects) {
        for (const key of keys) {
          const value = (obj as any)?.[key];
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value;
          }
        }
      }
      return null;
    };
    
    // 初始化结果变量
    let originalScript = '暂无脚本内容';
    let visualStyleAnalysis = '暂无视觉风格分析';
    let cinematographyTechniques = '暂无剪辑技术分析';
    let marketingAdvice = '暂无优化建议';
    let reimaginedStoryboard: any[] = [];

    const directOriginalScript = pickFirstString([
      'originalScript',
      'original_script',
      'script',
      'scriptText',
      'full_script',
      'complete_script',
      'video_script',
      'script_content',
    ]);

    const directVisualStyleAnalysis = pickFirstString([
      'visualStyleAnalysis',
      'visual_style_analysis',
      'visualStyle',
      'style_analysis',
      'visual_analysis',
    ]);

    const directCinematographyTechniques = pickFirstString([
      'cinematographyTechniques',
      'cinematography_techniques',
      'cinematography',
      'editing_techniques',
      'shot_language',
    ]);

    const directMarketingAdvice = pickFirstString([
      'marketingAdvice',
      'marketing_advice',
      'optimization_advice',
      'optimization_suggestions_text',
      'business_advice',
    ]);

    if (directOriginalScript) {
      originalScript = directOriginalScript;
    }
    if (directVisualStyleAnalysis) {
      visualStyleAnalysis = directVisualStyleAnalysis;
    }
    if (directCinematographyTechniques) {
      cinematographyTechniques = directCinematographyTechniques;
    }
    if (directMarketingAdvice) {
      marketingAdvice = directMarketingAdvice;
    }
    
    // ========== 步骤4.2: 提取脚本内容 ==========
    console.log('[ai-video-analysis] 步骤4.2: 开始提取脚本内容');

    if (originalScript !== '暂无脚本内容') {
      console.log('[ai-video-analysis] 步骤4.2.0: 命中直接脚本字段，跳过结构化脚本重建');
    }
    
    // 尝试多种可能的脚本字段路径
    const scriptPaths = [
      pickFirstObject([
        'script_reconstruction',
        'script_restoration',
        'script_content',
        'full_script',
        'complete_script',
        'video_script',
        'script_breakdown',
        'scriptReconstruction',
      ]),
    ].filter(Boolean);
    
    console.log('[ai-video-analysis] 步骤4.2.1: 找到的脚本路径数量:', scriptPaths.length);
    
    if (originalScript === '暂无脚本内容' && scriptPaths.length > 0) {
      const scriptData = scriptPaths[0];
      console.log('[ai-video-analysis] 步骤4.2.2: 使用脚本路径:', Object.keys(scriptData));
      
      // 提取视觉文本（支持多种字段名）
      const visualText = 
        Array.isArray(scriptData.visual_text) ? scriptData.visual_text :
        Array.isArray(scriptData.on_screen_text) ? scriptData.on_screen_text :
        Array.isArray(scriptData.onScreenText) ? scriptData.onScreenText :
        Array.isArray(scriptData.body_text) ? scriptData.body_text :
        [];
      
      console.log('[ai-video-analysis] 步骤4.2.3: visual_text 长度:', visualText.length);
      console.log('[ai-video-analysis] 步骤4.2.4: visual_text 内容:', visualText);
      
      // 提取旁白/叙述（支持多种字段名）
      const narration = 
        scriptData.implied_narration ||
        scriptData.voiceover_logic ||
        scriptData.voiceover_reconstruction ||
        scriptData.audio_narrative ||
        scriptData.suggested_voiceover ||
        scriptData.suggestedVoiceover ||
        scriptData.voiceover ||
        scriptData.audio_pacing ||
        scriptData.audio_implied ||
        '';
      
      console.log('[ai-video-analysis] 步骤4.2.5: narration 长度:', narration.length);
      console.log('[ai-video-analysis] 步骤4.2.6: narration 内容:', narration);
      
      // 提取开头和结尾
      const opening = scriptData.opening || '';
      const closing = scriptData.closing || '';
      const ctaText = scriptData.cta_text || '';
      
      // 组合脚本
      const scriptParts = [opening, ...visualText, narration, closing, ctaText].filter(Boolean);
      originalScript = scriptParts.join('\n') || '暂无脚本内容';
      
      console.log('[ai-video-analysis] 步骤4.2.7: ✅ 脚本提取完成，长度:', originalScript.length);
      console.log('[ai-video-analysis] 步骤4.2.8: originalScript 内容:', originalScript);
    } else {
      console.warn('[ai-video-analysis] 步骤4.2: ⚠️ 未找到脚本数据');

      // Fallback for compact payloads where script fields are flattened.
      const fallbackVisualText = pickFirstArray(['on_screen_text', 'onScreenText', 'visual_text', 'body_text']);
      const fallbackNarration = pickFirstString([
        'suggested_voiceover',
        'suggestedVoiceover',
        'implied_narration',
        'voiceover_reconstruction',
        'voiceover',
      ]);
      const fallbackScriptParts = [...fallbackVisualText, fallbackNarration].filter(
        (value) => typeof value === 'string' && value.trim()
      );
      if (fallbackScriptParts.length > 0) {
        originalScript = fallbackScriptParts.join('\n');
        console.log('[ai-video-analysis] 步骤4.2.9: ✅ 使用回退策略提取脚本，长度:', originalScript.length);
      }
    }
    
    // ========== 步骤4.3: 提取分镜数据 ==========
    console.log('[ai-video-analysis] 步骤4.3: 开始提取分镜数据');
    
    // 尝试多种可能的分镜字段路径
    const shotBreakdown = pickFirstArray([
      'storyboard_breakdown',
      'storyboardBreakdown',
      'shot_breakdown',
      'shotBreakdown',
      'shot_by_shot_analysis',
      'shotByShotAnalysis',
      'scene_breakdown',
      'sceneBreakdown',
      'reimaginedStoryboard',
      'reimagined_storyboard',
      'storyboard',
      'shots',
    ]);
    
    console.log('[ai-video-analysis] 步骤4.3.1: shotBreakdown 长度:', shotBreakdown.length);
    console.log('[ai-video-analysis] 步骤4.3.2: shotBreakdown 第一个元素:', shotBreakdown[0] ? Object.keys(shotBreakdown[0]) : '空');
    
    if (shotBreakdown.length > 0) {
      // 构建视觉风格分析
      if (visualStyleAnalysis === '暂无视觉风格分析') {
        visualStyleAnalysis = shotBreakdown.map((shot: any, index: number) => {
          const shotNumber = shot.shot_number || shot.scene_index || shot.shot_range || shot.frame_range || shot.shotNumber || (index + 1);
          const desc = shot.description || shot.visual_description || shot.visualContent || shot.visual_content || shot.composition || '';
          console.log(`[ai-video-analysis] 步骤4.3.3: 处理镜头 ${index + 1}: shotNumber=${shotNumber}, desc长度=${desc.length}`);
          return `镜头 ${shotNumber}: ${desc}`;
        }).filter(Boolean).join('\n\n') || '暂无视觉风格分析';
      }

      console.log('[ai-video-analysis] 步骤4.3.4: ✅ visualStyleAnalysis 长度:', visualStyleAnalysis.length);
      
      // 构建剪辑技术分析
      if (cinematographyTechniques === '暂无剪辑技术分析') {
        cinematographyTechniques = shotBreakdown.map((shot: any, index: number) => {
          const shotNumber = shot.shot_number || shot.scene_index || shot.shotNumber || (index + 1);
          const comp = shot.composition || shot.frame_composition || '';
          const camera = shot.camera_movement || shot.movement || shot.camera || '';
          const lighting = shot.lighting || shot.light || '';
          const emotion = shot.emotion || shot.emotional_tone || shot.mood || '';
          console.log(`[ai-video-analysis] 步骤4.3.5: 处理镜头 ${index + 1}: comp=${comp}, camera=${camera}, lighting=${lighting}, emotion=${emotion}`);
          return `镜头 ${shotNumber}: ${comp}，${camera}，${lighting}，${emotion}`;
        }).filter(Boolean).join('\n') || '暂无剪辑技术分析';
      }

      console.log('[ai-video-analysis] 步骤4.3.6: ✅ cinematographyTechniques 长度:', cinematographyTechniques.length);
      
      // 构建分镜表
      reimaginedStoryboard = shotBreakdown.map((shot: any, index: number) => {
        const shotNumber = shot.shot_number || shot.scene_index || shot.shotNumber || (index + 1);
        const frameRange = shot.frame_range || shot.shot_range || '';
        const startFrame = frameRange ? parseInt(String(frameRange).split('-')[0]) || shotNumber : shotNumber;
        const comp = shot.composition || shot.frame_composition || '';
        const camera = shot.camera_movement || shot.movement || shot.camera || '';
        const lighting = shot.lighting || shot.light || '';
        const emotion = shot.emotion || shot.emotional_tone || shot.mood || '';
        const desc = shot.description || shot.visual_description || shot.visualContent || shot.visual_content || comp || `镜头 ${shotNumber}`;
        
        const storyboardItem = {
          shotNumber: startFrame,
          visualContent: desc,
          composition: comp,
          camera: camera,
          lighting: lighting,
          mood: emotion,
          isDynamicSplit: false,
          mjPromptEn: `${comp}, ${camera}, ${lighting}, ${emotion}`.replace(/^,\s*|,\s*$/g, ''),
          mjPromptZh: desc,
        };
        
        console.log(`[ai-video-analysis] 步骤4.3.7: 分镜 ${index + 1}:`, JSON.stringify(storyboardItem, null, 2));
        return storyboardItem;
      });
      
      console.log('[ai-video-analysis] 步骤4.3.8: ✅ reimaginedStoryboard 长度:', reimaginedStoryboard.length);
    } else if (Array.isArray((data as any)?.reimaginedStoryboard)) {
      reimaginedStoryboard = (data as any).reimaginedStoryboard;
      console.log('[ai-video-analysis] 步骤4.3.9: 使用现成 reimaginedStoryboard，长度:', reimaginedStoryboard.length);
    } else {
      console.warn('[ai-video-analysis] 步骤4.3: ⚠️ 未找到分镜数据');
    }
    
    // ========== 步骤4.4: 提取优化建议 ==========
    console.log('[ai-video-analysis] 步骤4.4: 开始提取优化建议');
    
    // 尝试多种可能的优化建议字段路径
    const optimizationArray = pickFirstArray([
      'optimization_strategies',
      'optimizationStrategies',
      'optimization_suggestions',
      'optimizationSuggestions',
      'expert_optimization_advice',
      'expertOptimizationAdvice',
    ]);

    const optimizationObject = pickFirstObject([
      'optimization_strategies',
      'optimizationStrategies',
      'expert_optimization_strategies',
      'expertOptimizationStrategies',
      'optimization_strategy',
      'optimizationStrategy',
      'optimization_suggestions',
      'optimizationSuggestions',
      'expert_optimization_advice',
      'expertOptimizationAdvice',
      'operation_optimization_proposals',
      'operationOptimizationProposals',
    ]);

    const optimizationData = optimizationArray.length > 0 ? optimizationArray : (optimizationObject || {});
    
    console.log('[ai-video-analysis] 步骤4.4.1: optimizationData 类型:', Array.isArray(optimizationData) ? '数组' : typeof optimizationData);
    console.log('[ai-video-analysis] 步骤4.4.2: optimizationData 的键:', Array.isArray(optimizationData) ? `数组长度: ${optimizationData.length}` : Object.keys(optimizationData));
    
    const marketingAdviceParts: string[] = [];
    
    if (Array.isArray(optimizationData)) {
      // 数组格式：每个元素可能有 dimension/category 和 suggestion/content
      console.log('[ai-video-analysis] 步骤4.4.3: 处理数组格式的优化建议');
      optimizationData.forEach((item: any, index: number) => {
        const dimension = item.dimension || item.category || '';
        const suggestion = item.suggestion || item.content || '';
        console.log(`[ai-video-analysis] 步骤4.4.3.${index + 1}: dimension=${dimension}, suggestion长度=${suggestion.length}`);
        if (dimension && suggestion) {
          marketingAdviceParts.push(`【${dimension}】\n${suggestion}`);
        }
      });
    } else if (typeof optimizationData === 'object' && optimizationData !== null) {
      // 对象格式：字段可能是字符串或数组
      console.log('[ai-video-analysis] 步骤4.4.4: 处理对象格式的优化建议');
      
      const fieldMappings: { [key: string]: string } = {
        'hook_optimization': '黄金3秒钩子优化',
        'pacing_rhythm': '节奏调整',
        'rhythm_adjustment': '节奏调整',
        'pacing_adjustment': '节奏调整',
        'visual_enhancement': '视觉优化',
        'cta_enhancement': '行动号召',
        'cta_strengthening': '行动号召',
        'emotional_value': '情绪价值',
        'commercial_conversion': '商业转化',
        'ecommerce_conversion': '商业转化',
      };
      
      Object.keys(optimizationData).forEach((key) => {
        const value = (optimizationData as any)[key];
        const category = fieldMappings[key] || key;
        
        if (Array.isArray(value)) {
          console.log(`[ai-video-analysis] 步骤4.4.4.1: ${key} 是数组，长度:`, value.length);
          marketingAdviceParts.push(`【${category}】\n${value.join('\n')}`);
        } else if (typeof value === 'string' && value.trim()) {
          console.log(`[ai-video-analysis] 步骤4.4.4.2: ${key} 是字符串，长度:`, value.length);
          marketingAdviceParts.push(`【${category}】\n${value}`);
        }
      });
    }
    
    if (marketingAdviceParts.length > 0) {
      marketingAdvice = marketingAdviceParts.join('\n\n');
    }
    console.log('[ai-video-analysis] 步骤4.4.5: ✅ marketingAdviceParts 数量:', marketingAdviceParts.length);
    console.log('[ai-video-analysis] 步骤4.4.6: marketingAdvice 长度:', marketingAdvice.length);
    console.log('[ai-video-analysis] 步骤4.4.7: marketingAdvice 内容:', marketingAdvice);
    
    // ========== 步骤5: 构建最终分析对象 ==========
    console.log('[ai-video-analysis] 步骤5: ✅ 开始构建最终分析对象');
    console.log('[ai-video-analysis] 步骤5.1: 解析结果汇总');
    console.log('[ai-video-analysis] 步骤5.1.1: originalScript 长度:', originalScript.length);
    console.log('[ai-video-analysis] 步骤5.1.2: visualStyleAnalysis 长度:', visualStyleAnalysis.length);
    console.log('[ai-video-analysis] 步骤5.1.3: cinematographyTechniques 长度:', cinematographyTechniques.length);
    console.log('[ai-video-analysis] 步骤5.1.4: marketingAdvice 长度:', marketingAdvice.length);
    console.log('[ai-video-analysis] 步骤5.1.5: reimaginedStoryboard 长度:', reimaginedStoryboard.length);
    
    // 从 marketingAdvice 中提取第一部分作为 directorAdvice
    const directorAdvice = marketingAdvice && marketingAdvice !== '暂无优化建议' 
      ? marketingAdvice.split('\n\n')[0] || '请参考运营与改写建议'
      : '请参考运营与改写建议';
    
    console.log('[ai-video-analysis] 步骤5.2: directorAdvice 长度:', directorAdvice.length);
    
    const analysis: VideoAnalysis = {
      originalScript: originalScript,
      visualStyleAnalysis: visualStyleAnalysis,
      cinematographyTechniques: cinematographyTechniques,
      marketingAdvice: marketingAdvice,
      colorPalette: [], // API 返回中没有颜色信息，留空
      directorAdvice: directorAdvice,
      reimaginedStoryboard: reimaginedStoryboard,
      isRewrite: !!targetTopic
    };
    
    console.log('[ai-video-analysis] 步骤5.3: ✅ 最终 analysis 对象构建完成');
    console.log('[ai-video-analysis] 步骤5.3.1: analysis.originalScript 长度:', analysis.originalScript.length);
    console.log('[ai-video-analysis] 步骤5.3.2: analysis.visualStyleAnalysis 长度:', analysis.visualStyleAnalysis.length);
    console.log('[ai-video-analysis] 步骤5.3.3: analysis.cinematographyTechniques 长度:', analysis.cinematographyTechniques.length);
    console.log('[ai-video-analysis] 步骤5.3.4: analysis.marketingAdvice 长度:', analysis.marketingAdvice.length);
    console.log('[ai-video-analysis] 步骤5.3.5: analysis.reimaginedStoryboard 长度:', analysis.reimaginedStoryboard.length);
    console.log('[ai-video-analysis] 步骤5.3.6: 完整 analysis 对象:', JSON.stringify(analysis, null, 2));
    
    // 验证必需字段
    const missingCriticalFields: string[] = [];
    if (!analysis.visualStyleAnalysis || analysis.visualStyleAnalysis === '暂无视觉风格分析') {
      missingCriticalFields.push('visualStyleAnalysis');
    }
    if (!analysis.cinematographyTechniques || analysis.cinematographyTechniques === '暂无剪辑技术分析') {
      missingCriticalFields.push('cinematographyTechniques');
    }
    if (!analysis.reimaginedStoryboard || analysis.reimaginedStoryboard.length === 0) {
      missingCriticalFields.push('reimaginedStoryboard');
    }

    if (missingCriticalFields.length > 0) {
      console.warn('[ai-video-analysis] 步骤5.4: ⚠️ 警告 - 核心分析字段缺失:', missingCriticalFields.join(', '));
    } else {
      console.log('[ai-video-analysis] 步骤5.4: ✅ 分析结果验证通过');
    }
    
    console.log('[ai-video-analysis] ========== 解析完成 ==========');
    return analysis;
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

/**
 * 执行一键改写逻辑
 */
export const rewriteScriptAction = async (
  originalScript: string,
  marketingAdvice: string,
  targetTopic?: string
): Promise<string> => {
  try {
    const promptText = `你是一位顶尖的短视频编剧。请根据以下参考内容，为我完成一次【一键改写】。

【改写规则】：
1. **框架不变**：严格遵循原脚本的逻辑结构和节奏点，不改变其核心表达流。
2. **字数对齐**：改写后的文案总字数必须与原脚本保持在 ±20% 的偏差范围内。
3. **建议融合**：深度融入提供的"运营与改写建议"中的策略（如钩子、悬念、CTA等）。
4. **目标导向**：${targetTopic ? `应用到新的主题："${targetTopic}"中。` : '在保持原主题的基础上提升表达力。'}

【参考原脚本】：
${originalScript}

【参考优化策略】：
${marketingAdvice}

请直接输出改写后的文案内容，不要解释。`;

    const response = await generateContent({
      model: 'gemini-3-flash-preview',
      task: 'text_gen',
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }],
        },
      ],
      config: {
        temperature: 0.7,
      }
    } as GeminiGenerateRequest);

    return extractTextFromResponse(response) || "改写生成失败";
  } catch (error) {
    console.error("Rewrite failed:", error);
    throw error;
  }
};
