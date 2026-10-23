export function presenterFormState(duration, requestedMode) {
  if (Number.isFinite(duration) && duration > 15) {
    return {
      mode: 'reference',
      forced: true,
      requiresPhotos: true,
      message: '视频超过 15 秒，需要指定模特以保持分段人物一致'
    };
  }
  if (requestedMode === 'reference') {
    return {
      mode: 'reference',
      forced: false,
      requiresPhotos: true,
      message: '上传 1–5 张同一位成年模特照片'
    };
  }
  return {
    mode: 'generated',
    forced: false,
    requiresPhotos: false,
    message: '模型将自动生成一位明确成年的带货人物'
  };
}
