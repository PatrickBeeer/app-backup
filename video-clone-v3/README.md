<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Video Clone 本地应用

这是一个可独立运行的 Vite/React 应用。页面与业务流程保持原样；AI 生成、素材上传等能力通过可配置的本地 API 代理转发。

## Run Locally

**Prerequisites:** Node.js 20+


1. Install dependencies: `npm install`
2. Optional: copy `.env.example` to `.env.local` and set the local API address.
3. Run the app: `npm run dev`

启动后访问 `http://127.0.0.1:1111/`。应用围绕产品视频生成，提供“复刻视频”和“全新创意”两种方式，默认使用可灵。“复刻视频”会自动定位并替换原产品；“全新创意”会先分析产品的真实类别、用途、结构、材质、卖点与适用场景，再提取爆款视频的开场钩子、镜头职能、动作因果、展示节拍、转场与收尾逻辑，为该产品创造合适的新画面。产品轮廓、比例、结构、包装、Logo和标签作为逐帧不可变约束。可灵的 API Key 应由本地 API 代理读取，不能写入 `VITE_*` 前端变量。

Production build: `npm run build`, then `npm run preview`.
