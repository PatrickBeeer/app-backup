# 形象墙效果图设计

UnityShop 独立应用版形象墙设计工具，支持：

- 上传结构设计图并生成平面设计图
- 上传风格参考图约束设计方向
- 在确认平面方案后生成空间效果图

## 本地开发

前提：Node.js、pnpm

推荐从共享依赖工作区运行：

1. 安装依赖
   `cd /root/projects/unityshop/apps/shared_dependencies && pnpm install -r`
2. 启动开发服务器
   `cd /root/projects/unityshop/apps/standalone_apps/wall-display-designer && pnpm dev`
3. 打开本地地址
   `http://localhost:4795`

## 生产托管

- 独立托管路径：`/standalone/wall-display-designer/`
- 壳应用访问路径：`/app/wall-display-designer`

## API 说明

- 浏览器侧图片生成请求统一通过 UnityShop API Manager 转发
- 计费任务统一使用 `task: "image_gen"` 和 `billing_task: "image_gen"`，避免命中缺失定价规则的问题
