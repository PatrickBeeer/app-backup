
/**
 * 视频前端智能抽帧工具
 * 升级版：自适应采样算法
 */
export const extractVideoFrames = async (
  source: File | string,
  fps: number = 0.5 // 基础频率，每2秒1帧
): Promise<{ data: string; mimeType: string }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames: { data: string; mimeType: string }[] = [];

    if (typeof source === 'string') {
      video.crossOrigin = 'anonymous';
      video.src = source;
    } else {
      video.src = URL.createObjectURL(source);
    }

    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      
      /**
       * 【智能自适应算法逻辑】
       * 1. 基础：每 2 秒抽 1 帧
       * 2. 最小保障：10 帧 (确保 5s 内的短片也能被 AI 读懂节奏)
       * 3. 最大上限：40 帧 (防止长视频导致 API 响应过慢或 Token 费用爆炸)
       */
      let totalFramesToExtract = Math.ceil(duration * fps);
      totalFramesToExtract = Math.max(10, Math.min(totalFramesToExtract, 40));
      
      // 限制分辨率，兼顾文案清晰度与传输体积 (Gemini 识别 720p 帧非常精准)
      const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      console.log(`视频时长: ${duration.toFixed(2)}s, 采用自适应算法，计划抽取: ${totalFramesToExtract} 帧`);

      try {
        for (let i = 0; i < totalFramesToExtract; i++) {
          // 均匀采样点计算
          const time = (i / (totalFramesToExtract - 1)) * (duration - 0.1);
          video.currentTime = time;
          
          await new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error("抽帧超时")), 8000);
            const seekHandler = () => {
              clearTimeout(timeout);
              video.removeEventListener('seeked', seekHandler);
              if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                // 质量设为 0.7 可以在保持文字清晰的同时极大缩小 base64 体积
                const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                frames.push({ data: base64, mimeType: 'image/jpeg' });
              }
              res(true);
            };
            video.addEventListener('seeked', seekHandler);
          });
        }
        if (typeof source !== 'string') URL.revokeObjectURL(video.src);
        resolve(frames);
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => reject(new Error("视频资源无法访问。若是链接地址，请确保服务器支持 CORS 跨域请求。"));
  });
};
