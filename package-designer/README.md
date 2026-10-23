<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# 包装设计工作台

UnityShop 独立应用版包装设计工具，支持：

- 包装效果图生成
- 展开图生成
- 材质与工艺标注

## 本地开发

前提：Node.js、pnpm

推荐从共享依赖工作区运行：

1. 安装依赖
   `cd /root/projects/unityshop/apps/shared_dependencies && pnpm install -r`
2. 启动开发服务器
   `cd /root/projects/unityshop/apps/standalone_apps/package-designer && pnpm dev`
3. 打开本地地址
   `http://localhost:4797`

## 生产托管

- 独立托管路径：`/standalone/package-designer/`
- 壳应用访问路径：`/app/package-designer`

## API 说明

- 浏览器侧图像生成请求统一通过 UnityShop API Manager 转发
- 计费任务统一使用 `billing_task: "image_gen"`，避免命中缺失定价规则的问题
