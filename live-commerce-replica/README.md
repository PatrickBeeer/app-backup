# 镜刻：真人带货视频复刻工作台

镜刻是一套本地 Web 应用。它使用真人带货参考视频约束分镜与节奏：15 秒以内整段生成，超过 15 秒时自动拆成 4–15 秒单元；生成后逐段审核，最终按原时间线拼回一条 720p 成片。

参考视频提供镜头结构、场景、道具、动作、运镜、剪辑节奏、声音节奏和台词表达骨架。人物可来自用户上传的 1–5 张授权照片，也可在 15 秒以内由模型生成；商品事实只来自新商品资料。

## 已交付流程

1. 上传本地 MP4、MOV 或 WebM 参考视频。
2. 选择 9:16 或 16:9 输出画幅。
3. 选择上传 1–5 张授权成年模特照片，或在 15 秒以内让模型生成成年带货人物；另上传 1–9 张商品图。
4. 填写商品名称、价格、卖点、规格、必说内容和禁用表达。
5. FFmpeg 自动检测镜头、语音停顿并抽取代表帧；音轨只解码为内存采样，不保存或上传独立参考音频。
6. 本地 Whisper 取得带时间轴的参考原台词，DeepSeek 模仿原句式、语气、卖点顺序和促单节奏，同时把所有商品事实替换为新资料；识别结果和新文案均统一转为简体中文。
7. 在一次确认页对照参考原台词与新商品台词，可编辑并保存后再进入付费生成。
8. 生成前从原始参考视频按单元时间重新截取带原音轨的参考片段，再调用智算谷 `free-video-2.0-multimodal-video`；提示词要求模型参考原说话人的音色、声线、口音、语气和情绪，同时逐字朗读已确认的新商品台词并原生生成口型、音乐、环境声和音效。
9. 主模型缺少参考片段时，使用 `free-video-2.0-image-to-video` 首尾帧兜底。
10. 持久化远端任务 ID，重启后继续查询，不重复提交已有任务。
11. 自动检查解码、时长、画幅、720p 和音轨；问题片段支持接受、重做或上传替代。
12. 按原时间线归一化、拼接并烧录 ASS 字幕，输出唯一最终 MP4。

## 快速启动

要求：

- Node.js 22.21 或更新版本
- FFmpeg 与 FFprobe 已加入 `PATH`

Windows 双击：

```text
scripts\start.cmd
```

也可以手动运行：

```bash
npm install
copy .env.example .env
npm start
```

打开 <http://127.0.0.1:3013>。

`.env.example` 默认启用 `DEMO_MODE=true`。演示模式不会调用付费 API，但会用 FFmpeg 生成带画面与音轨的本地候选，因此可以完整验证创建、分析、确认、审核和成片导出。

首次分析有音轨的参考视频时，本地 ASR 会下载并缓存 Whisper 模型，因此第一次可能比后续分析更慢。模型缓存不包含用户视频或音频。应用会自动读取 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY`，因此需要代理才能访问模型仓库时无需额外修改启动命令。

## 真实模式

将 `.env` 改为：

```dotenv
DEMO_MODE=false
CPRT_BASE_URL=https://ai-api.cprt.xyz
CPRT_API_KEY=只保存在本机的APIKey
CPRT_VIDEO_MODEL=free-video-2.0-multimodal-video
CPRT_FALLBACK_MODEL=free-video-2.0-image-to-video
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=只保存在本机的APIKey
DEEPSEEK_MODEL=deepseek-v4-flash
LOCAL_ASR_ENABLED=true
WHISPER_MODEL=onnx-community/whisper-small
```

`LOCAL_ASR_ENABLED=true` 时，本地 Whisper 会读取 FFmpeg stdout 中的 16 kHz 单声道 PCM。PCM 不写入项目目录、不进入对象存储，也不会发送给 DeepSeek 或智算谷；只有转写后的文字会交给 DeepSeek。若模型下载、解码或转写失败，项目会自动降级到商品事实文案并继续进入确认页。

视频 API 不能访问 `localhost`，所以本地上传的照片和参考片段必须获得公网 HTTPS URL。应用支持两种方式。

### 腾讯私有 COS

```dotenv
COS_BUCKET=完整存储桶名称
COS_REGION=存储桶地域
COS_SECRET_ID=只保存在本机
COS_SECRET_KEY=只保存在本机
COS_KEY_PREFIX=jingke
COS_SIGNED_URL_TTL_SECONDS=86400
```

应用从服务端上传私有对象并生成临时签名 URL。人物、商品和参考视频不会向浏览器暴露 COS 密钥；生成结果成功后会立即下载到本地。

### 已有公网入口

如果本地服务已经通过反向代理或隧道获得公网地址，可设置：

```dotenv
MEDIA_PUBLIC_BASE_URL=https://your-public-host.example
```

该地址必须能访问应用的 `/media/*` 路由。

## 智算谷接口

- 创建任务：`POST https://ai-api.cprt.xyz/v1/chat/asyncTask`
- 查询任务：`GET https://ai-api.cprt.xyz/v1/chat/asyncTask/{taskId}`
- 文案改写：`POST https://api.deepseek.com/chat/completions`
- [多模态视频接口文档](https://ai-cprt-xyz.apifox.cn/497080549e0)
- [图生视频接口文档](https://ai-cprt-xyz.apifox.cn/497080007e0)
- [通用异步查询文档](https://ai-cprt-xyz.apifox.cn/450668598e0)

多模态视频和首尾帧兜底请求都传入 `conversionSlots: ["all"]`，使当前请求中的所有图片/视频槽位按智算谷接口约定资产化。指定模特模式会把人物照片放在 `imageUrls` 前部；两种人物模式的 `audioUrls` 都为空。原音色参考随带音轨的 `videoUrls` 提交，不拆分独立参考音频。

## 数据与安全

- SQLite：`data/jingke.sqlite`
- 上传、抽帧、切段、候选和成片：`data/projects/`
- CPRT API Key、DeepSeek API Key 与 COS Secret 只从未提交的 `.env` 读取。
- 密钥不会进入前端响应、SQLite、项目 JSON 或日志。
- 用户确认生成方案前，服务不会创建付费视频任务。
- 平台内容审核拒绝后不会自动付费重试；用户确认素材合规后可手动再次生成，连续失败时再更换素材。
- 新建项目或重新分析后才会使用本地转写和高度仿写；已经完成分析的旧项目不会被自动改写。
- 自动重试最多一次；用户主动重做会保留历史候选。

## 验证

```bash
npm test
npm run typecheck
npm run smoke:demo
```

`smoke:demo` 会在系统临时目录创建隔离项目和 32 秒测试视频，启动随机空闲端口，完整走通工作流后清理临时数据。

## 现实边界

- “完全一样”是镜头结构、时间点、动作、运镜、场景、道具和声音节奏的高保真目标，不代表像素级复制；商品款式与口播事实必须以新商品资料为准。
- 视频模型生成的真人、商品细节与口播仍可能偏移，因此问题片段审核不是可选装饰，而是交付闸门。
- 参考视频原音色只通过多模态提示词尽量复刻，不等同于专业声音克隆；模型仍可能复用少量旧台词，生成后必须人工核验新商品口播。
- 画面文字采用后期重绘；模型结果中出现在非预期区域的乱码会被标记给用户核验，首版不做可能破坏商品画面的强制涂抹。
- 真实生成会产生第三方 API 费用。先在演示模式确认流程，再切换真实模式。

详细产品规格与实现计划位于：

- `docs/superpowers/specs/2026-08-13-seedance-live-commerce-replica-design.md`
- `docs/superpowers/plans/2026-08-13-seedance-live-commerce-replica.md`
- `docs/superpowers/specs/2026-08-13-presenter-modes-and-deepseek-copy-design.md`
- `docs/superpowers/plans/2026-08-13-presenter-modes-and-deepseek-copy.md`
- `docs/superpowers/specs/2026-08-13-reference-copy-imitation-design.md`
- `docs/superpowers/plans/2026-08-13-reference-copy-imitation.md`
- `docs/superpowers/specs/2026-08-17-reference-video-voice-prompt-design.md`
- `docs/superpowers/plans/2026-08-17-reference-video-voice-prompt.md`
