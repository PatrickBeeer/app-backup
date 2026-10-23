import { generateContent, extractImageFromResponse } from '../../../../shared_services/geminiProxyService';

type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
type ImageSize = '2K' | '4K';
type GenerationModel = 'flash' | 'pro';
type InstallationType = 'table' | 'wall' | 'side' | 'room';

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

export async function generateProductImage(
  images: string[],
  prompt: string,
  aspectRatio: AspectRatio = '1:1',
  imageSize: ImageSize = '2K',
  model: GenerationModel = 'flash',
  installationType: InstallationType = 'table',
  imageCount: number = 3,
  onImageReady?: (url: string, index: number) => void
): Promise<string[]> {
  const installationDesc = {
    table: '产品为【桌面展示桌牌】，属于摆放式展示用品，无需打孔、无需安装、无需粘贴。直接平稳放置在桌面、台面、吧台、前台等平整位置。场景应呈现桌面立式摆放、简洁干净、高级轻奢、无复杂结构、即放即用的质感。',
    wall: '产品为【墙面粘贴式门牌】，背面自带强力背胶，平贴在墙面或门体上方。安装位置通常在开门一侧墙面，高度约2米（最上沿低于门框2-15cm），视角自然。适用于办公室、酒店、会议室等室内平整墙面，呈现简约轻奢的质感。',
    side: '产品为【立式双面侧挂牌】，采用螺丝固定侧挂。安装位置必须固定于门框侧面，水平距离门边约10cm。垂直高度要求门牌上边缘与门框上沿平齐（或向下偏移5cm以内）。适用于商铺、办公室等长期使用的门体，展现专业且具有工业美感的侧挂结构。',
    room: '产品为【高端餐饮包厢门牌】，平贴于包厢门口墙面。重要说明：产品本身即为光源，请表现出产品自带的真实自发光效果，光芒应从产品内部透出，照亮周围小范围墙面。严禁自行添加任何外部灯具、射灯或装饰物。比例控制：请确保门牌在墙面上的比例符合常识，门牌宽度通常仅为墙面宽度的1/10左右。场景背景应呈现极具质感的墙面（如深色大理石、木饰面），侧边露出精致的木质门框，背景可包含中式窗帘、室内绿植或隐约可见的包厢内景。光影需采用暗调氛围感，通过深邃的明暗对比来突出产品本身的亮度。核心准则：严禁对产品进行任何形式的“二次创作”或“装饰”，必须100%保留原图中的形状、文字、图标和设计。'
  }[installationType];

  const imageParts = images.map((img) => {
    const commaIndex = img.indexOf(',');
    const mimeTypeMatch = img.match(/^data:(.*?);base64,/);
    const mimeType = mimeTypeMatch?.[1] || 'image/png';
    const base64Data = commaIndex >= 0 ? img.slice(commaIndex + 1) : img;

    return {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    };
  });

  const promptText = `这些是产品的白底原图。请将这些原图中的产品，原封不动地“摆放”到以下描述的实拍场景中。

安装形式：${installationDesc}
场景背景要求：${prompt}。

核心执行准则（严禁偏离）：
1. 产品一致性：生成图中的产品必须与参考图中的产品在外观、颜色、材质、文字内容上100%完全一致。严禁改变产品的形状或设计。
2. 数量与组合：
   - 如果参考图中是一个产品，生成图中就只出现这一个产品。
   - 如果参考图中是多个产品的组合（套装），生成图中必须完整保留这组产品的组合形式，一起出现在场景中。
3. 物理真实性：
   - 如果是【桌牌】，请确保它稳固地立在桌面上，有真实的投影。
   - 如果是【单面贴墙】，请确保它平整地贴在墙上，与墙面平行。
   - 如果是【侧挂】，请确保它垂直于墙面伸出，展示出侧面悬挂的结构感。
4. 严禁装饰：严禁在产品上添加原图中不存在的任何装饰元素（如钻石、镶钻效果、额外图标、花纹等）。必须保持产品原有的纯净设计。
5. 比例常识：严禁将产品生成得异常巨大。产品在场景中的大小必须符合真实物理比例。例如，门牌在墙面上应只占一小块区域，而不是贴满大部分墙面。请根据环境参照物（如门框、桌子、植物）来精准控制产品的缩放比例。

风格与质感指导：
- 场景美学：极简、高端、禅意。使用深色石材、高质感木材或极简墙面背景。
- 光影处理：采用柔和的侧向定向光，营造高级的明暗对比和深度阴影。
- 构图：采用大光圈摄影效果，产品主体清晰，背景适度虚化，突出产品的精致感。
- 整体氛围：高端、宁静、专业，呈现出顶级酒店或设计工作室的实拍质感。`;

  const modelId = model === 'pro' ? 'gemini-3.1-flash-image-preview' : 'gemini-3.1-flash-image-preview';

  const generateSingle = async (seed?: number): Promise<string> => {
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await generateContent({
          model: modelId,
          task: 'image_gen',
          billing_task: 'image_gen',
          contents: {
            parts: [...imageParts, { text: promptText }],
          },
          config: {
            seed,
            imageConfig: {
              aspectRatio,
              imageSize,
            },
          },
        });

        const imageUrl = extractImageFromResponse(response);
        if (imageUrl) {
          return imageUrl;
        }
        throw new Error('未获取到有效图片数据');
      } catch (error) {
        lastError = error;
        if (!isTransientConnectionError(error) || attempt === maxAttempts) {
          throw error;
        }
        await sleep(1200 * attempt);
      }
    }

    throw lastError || new Error('图像生成失败');
  };

  const results: string[] = [];
  for (let i = 0; i < imageCount; i++) {
    const seed = Math.floor(Math.random() * 1000000) + i;
    const imageUrl = await generateSingle(seed);
    results.push(imageUrl);
    onImageReady?.(imageUrl, i);
  }

  return results;
}
