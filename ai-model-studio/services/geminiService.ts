import { generateContent, extractJsonTextFromResponse, extractImageFromResponse } from '../../../shared_services/geminiProxyService';
import { ModelAnalysis, AspectRatio } from '../types';

const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const VEO_VIDEO_MODEL = 'veo_3_1';

/**
 * 分析上传的图片，提取模特特征、服装和环境信息
 */
export const analyzeImage = async (base64Image: string): Promise<ModelAnalysis> => {
  try {
    const response = await generateContent({
      model: GEMINI_TEXT_MODEL,
      task: 'text_gen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image,
            },
          },
          {
            text: `你是一位专业的时尚摄影总监。请深度分析这张模特图，为了在后续生成中严格保持人物长相一致，你需要提供极其精准的视觉描述。

请提取以下细节，并以 JSON 格式返回（所有描述性文字必须使用中文）：
1. genderFeatures: 极其详细的模特面部与身体特征。
   - 必须包含：具体的年龄感（如"20岁出头"）、精确的脸型（如"瓜子脸"）、肤色质感（如"冷白皮"）、种族特征。
   - 五官特写：眼睛形状与神态（如"大而圆的杏眼"）、鼻子形态（如"高挺的鼻梁"）、嘴唇特征、发型细节（颜色、长度、卷度、刘海）。
   - 这是一个"Face ID"级别的描述。
2. clothingDetails: 极其详细的服装分解。包括每一件单品的材质（如"粗花呢"、"丝绸"）、确切颜色、领口/袖口设计、剪裁廓形、配饰细节。
3. environment: 场景与背景的详细视觉描述。
4. lightingAndStyle: 摄影光影（如"柔和自然光"、"影棚闪光灯"）与整体色调。`
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            genderFeatures: { type: 'string' },
            clothingDetails: { type: 'string' },
            environment: { type: 'string' },
            lightingAndStyle: { type: 'string' },
          },
          required: ['genderFeatures', 'clothingDetails', 'environment', 'lightingAndStyle'],
        },
      },
    });

    const jsonText = extractJsonTextFromResponse(response);
    
    try {
      return JSON.parse(jsonText) as ModelAnalysis;
    } catch (parseError: any) {
      console.error('JSON 解析失败:', parseError);
      console.error('响应文本（前500字符）:', jsonText.substring(0, 500));
      throw new Error(`分析结果格式错误: ${parseError.message || '无效的 JSON 格式'}`);
    }
  } catch (error) {
    console.error('分析失败:', error);
    throw error;
  }
};

/**
 * 基于参考图片和分析结果，生成4张不同角度的模特照片
 */
export const generateModelVariations = async (
  base64Image: string,
  analysis: ModelAnalysis,
  aspectRatio: AspectRatio
): Promise<string[]> => {
  try {
    // 定义4种严格不同的姿势
    const poseVariations = [
      // 1. 特写（面部焦点）
      'SHOT TYPE: Extreme Close-up Portrait (Headshot). COMPOSITION: Frame is filled with the face. POSE: Looking straight into the lens with intensity. ACTION: None, pure stillness. IGNORE REFERENCE BODY POSE.',
      
      // 2. 低角度动态（运动焦点）
      'SHOT TYPE: Low Angle Full Body. COMPOSITION: Camera near the ground looking up. POSE: Walking towards camera, legs in mid-stride. DYNAMIC: Hair flowing, fabric moving. IGNORE REFERENCE STATIC POSE.',
      
      // 3. 侧颜（轮廓焦点）
      'SHOT TYPE: 90-Degree Side Profile. COMPOSITION: Medium shot from the side. POSE: Standing completely sideways, looking at the horizon. PROFILE: Showcasing the jawline and side profile of the outfit. IGNORE REFERENCE FRONT POSE.',
      
      // 4. 高角度/坐姿（环境焦点）
      'SHOT TYPE: High Angle / Overhead. COMPOSITION: Camera looking down from above. POSE: Sitting gracefully on the floor/surface, looking up at the camera. VIBE: Artistic and editorial. IGNORE REFERENCE STANDING POSE.'
    ];

    // 为每个姿势创建生成请求
    const imagePromises = poseVariations.map(async (posePrompt, index) => {
      const uniqueRequestId = `${Date.now()}-${index}-${Math.random().toString(36).substring(7)}`;

      const fullPrompt = `
        You are an expert fashion photographer.
        
        REFERENCE IMAGE: Use the provided image for IDENTITY (Face ID) and CLOTHING details ONLY. 
        DO NOT COPY THE POSE.
        
        TASK: Photograph the SAME model in the SAME outfit, but in a specific NEW POSE.
        
        STRICT CONSTRAINTS:
        1. IDENTITY: The face must match the reference image exactly. (${analysis.genderFeatures})
        2. OUTFIT: The clothing must be identical. (${analysis.clothingDetails})
        3. SINGLE PERSON: Only ONE person in the frame.
        4. POSE: DISREGARD the pose in the reference image. FORCE the target pose defined below.
        5. ASPECT RATIO: The generated image aspect ratio must be strictly ${aspectRatio}. Please ensure the composition and layout fully comply with this aspect ratio requirement.
        
        TARGET POSE:
        ${posePrompt}
        
        VISUAL CONTEXT:
        - Environment: ${analysis.environment}
        - Lighting: ${analysis.lightingAndStyle}
        
        --
        Request ID: ${uniqueRequestId}
      `;

      const response = await generateContent({
        model: GEMINI_IMAGE_MODEL,
        task: 'image_gen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: fullPrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        },
      });

      const imageUrl = extractImageFromResponse(response);
      if (!imageUrl) {
        throw new Error(`Failed to generate image ${index + 1}`);
      }

      return imageUrl;
    });

    // 并行执行所有请求
    const results = await Promise.all(imagePromises);
    return results;
  } catch (error) {
    console.error('生成失败:', error);
    throw error;
  }
};

