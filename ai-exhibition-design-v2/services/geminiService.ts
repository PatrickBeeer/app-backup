
import { SceneType, UploadedImageData, ModelVersion, AspectRatio, ImageSize, PerspectiveType } from "../types";
import { generateContent, extractImageFromResponse } from "../../../shared_services/geminiProxyService";

export const GEMINI_TEXT_MODEL = 'gemini-3-flash-preview';
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const VEO_VIDEO_MODEL = 'veo_3_1';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isTransientConnectionError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('empty response') ||
    msg.includes('返回空响应') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('broken pipe') ||
    msg.includes('unexpected end') ||
    msg.includes('socket')
  );
}

export async function generateImageWithGemini(
  uploadedImage: UploadedImageData,
  scene: SceneType,
  version: ModelVersion = 'pro',
  customPrompt?: string,
  aspectRatio: AspectRatio = '1:1',
  imageSize: ImageSize = '1K',
  perspective: PerspectiveType = 'front',
  imageCount: number = 1,
  onImageReady?: (url: string, index: number) => void
): Promise<string[]> {
  void GEMINI_TEXT_MODEL;
  void VEO_VIDEO_MODEL;

  const modelId = GEMINI_IMAGE_MODEL;

  const imagePart = {
    inlineData: {
      mimeType: uploadedImage.mimeType,
      data: uploadedImage.base64,
    },
  };

  const finalSceneDescription = scene.id === 'custom-scene' && customPrompt 
    ? customPrompt 
    : scene.promptHint;

  const perspectiveMap = {
    'front': '正面视角 (Front View of the installation)',
    'side': '侧视视角 (Side View of the installation)',
    'top': '鸟瞰视角 (Top View/Bird\'s Eye View of the installation)'
  };

  const promptText = `你是一位顶级的商业美陈视觉设计师。
任务：将上传的图片（可能是2D平面设计、Logo或平面图）无缝融合到 "${scene.id === 'custom-scene' ? '自定义场景' : scene.name}" 中，并将其转化为具备厚度和体积感的3D立体装置。

视角与构图要求：
1. **核心视角：请采用 ${perspectiveMap[perspective]} 进行拍摄。**
2. **主体聚焦：无论装置被放置在空间的哪个侧边，相机镜头必须对准并聚焦于该装置，使其成为画面的视觉中心（Hero Shot）。**
3. **构图逻辑：${perspective === 'front' ? '相机必须正对着装置的正面进行平视拍摄，确保装置的正面细节完整、无偏差地呈现。' : '采用商业摄影构图。如果装置在侧边，相机应斜向对准装置，以展现其立体感，同时保留背景中空间的深度感和透视感。'}**

核心物理规则：
1. 3D立体化：如果上传的是2D平面图或Logo，请将其识别为“立体美陈结构”（3D Installation Structure）。根据设计线条赋予其合理的厚度、深度和体积感（Extrusion），使其看起来像是一个真实的物理实体。
2. 空间定位与落地逻辑：
   - 将其识别为“大型美陈结构”（Large-scale Installation）。
   - **绝对禁令：严禁将装置放置在任何行走通道、正门口、电梯口或道路的正中央。**
   - **强制落地逻辑：装置必须放置在场景的“一侧”（SIDE），例如靠近墙边、立柱旁、草坪边缘或广场远端。必须确保场景中央的通行路径完全畅通。**
   - 在 "${scene.name}" 场景中，必须严格遵循上述侧边放置逻辑。
3. 环境交互：
   - 阴影：根据场景光源（${finalSceneDescription}）生成真实的接触阴影和环境闭塞（AO）。
   - 反射：如果地面是光滑材质（如室内大理石、抛光地砖），必须生成装置的倒影。**如果地面是哑光材质（如校园广场的石材铺装、户外水泥地、草地），则严禁出现大理石般的镜面反射。**
   - 遮挡：确保空间的前后景深关系正确。
4. 材质表现：根据设计风格自动匹配材质（如金属、亚克力、发光灯箱等），并体现出材质的质感和光泽。
5. 负向约束：严禁出现任何沙发、茶几、普通家居用品。场景应保持纯净的商业展示感或建筑美感。**严禁生成分屏图、对比图、九宫格或任何形式的多图组合。输出必须是单一、完整、无边框的渲染全景图。**

场景细化要求：
${finalSceneDescription}

生成一张具备顶级商业摄影质感、物理逻辑严密、无缝融合且立体感十足的设计效果图。**注意：仅输出最终融合后的效果，严禁包含原始素材图或进行任何形式的“前后对比”展示。**`;

  const parts: any[] = [imagePart, { text: promptText }];

  const generateSingleImage = async (seed?: number): Promise<string> => {
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await generateContent({
          model: modelId,
          task: 'image_gen',
          contents: {
            parts,
          },
          config: {
            seed,
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: version === 'pro' ? imageSize : undefined, // 2.5 flash 不支持 imageSize
            },
          },
        });

        const imageUrl = extractImageFromResponse(response);
        if (imageUrl) {
          return imageUrl;
        }
        throw new Error('模型未返回有效的图像数据。');
      } catch (error) {
        lastError = error;
        if (!isTransientConnectionError(error) || attempt === maxAttempts) {
          throw error;
        }

        // Exponential-ish backoff: 1.5s, 3s.
        await sleep(1500 * attempt);
      }
    }

    throw lastError || new Error('图像生成过程中发生技术错误');
  };

  try {
    // 顺序生成可显著降低长连接并发导致的断连概率。
    const results: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      const seed = Math.floor(Math.random() * 1000000) + i;
      const url = await generateSingleImage(seed);
      results.push(url);
      onImageReady?.(url, i);
    }
    return results;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "图像生成过程中发生技术错误");
  }
}
