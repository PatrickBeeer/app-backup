# CPRT 多模态视频 API 参考

Provider: https://ai.cprt.xyz/ （文档: https://ai-cprt-xyz.apifox.cn/）

通用说明：
- 所有请求走 `https://ai-api.cprt.xyz`，Header 携带 `Authorization: Bearer {CPRT_KEY}`。
- 请求失败返回 HTTP 503（上游繁忙 / 余额不足 / 任务失败），成功时原样返回上游结果。

## 创建任务

`POST https://ai-api.cprt.xyz/v1/chat/asyncTask`

本 app 使用的模型（档次由低到高）：

| model | 原生分辨率 |
|---|---|
| `free-video-2.0-mini-multimodal-video` | 480p / 720p |
| `free-video-2.0-fast-multimodal-video` | 480p / 720p |
| `free-video-2.0-multimodal-video` | 480p / 720p / native1080p / native4k |
| `free-video-2.5-multimodal-video` | 480p / 720p |

Body 参数（四个模型一致）：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | String | 必填 | 模型完整名称 |
| `prompt` | String | 必填 | 提示词，1 - 20480 字符 |
| `resolution` | String | 必填 | 视频分辨率，见上表 |
| `duration` | String | 必填 | 视频时长（秒），枚举 `[-1, 4..15]` |
| `imageUrls` | List(String) | 可选 | 参考图片（0-9 张），每张 30 MB |
| `videoUrls` | List(String) | 可选 | 参考视频（0-3 个，多模态参考/视频编辑/视频续写）。单个时长 [2, 15] s，所有视频总时长 ≤ 15 s，每个 50 MB |
| `audioUrls` | List(String) | 可选 | 参考音频（0-3 个，需至少包含 1 个参考视频或图片）。单个 [2, 15] s，总时长 ≤ 15 s，每个 15 MB |
| `generateAudio` | Boolean | 可选 | 是否生成视频音频 |
| `ratio` | String | 可选 | 宽高比，枚举 `[adaptive, 16:9, 4:3, 1:1, 3:4, 9:16, 21:9]` |
| `realPersonMode` | Boolean | 可选 | 真人模式 |
| `conversionSlots` | List(String) | 可选 | 真人素材资产化槽位，多选；`all` 表示所有图片/视频槽位都做资产化。枚举 `[all, image1..image9, video1..video3]` |
| `returnLastFrame` | Boolean | 可选 | 是否返回视频尾帧图片 |
| `seed` | Int | 可选 | -1 - 2147483647 |
| `returnOriginData` | Boolean | 可选 | 返还原始链接 URL |

示例：

```json
{
  "model": "free-video-2.0-mini-multimodal-video",
  "prompt": "一只小狗在金秋麦田中奔跑，航拍视角，动画风格，电影级画面",
  "resolution": "480p",
  "duration": 4,
  "returnOriginData": true
}
```

返回（200）：

```json
{
  "taskId": "20260803112441_705gvSzDMMTcYLrPNikA6",
  "status": "QUEUED",
  "errorCode": "",
  "errorMessage": "",
  "results": null,
  "failedReason": {},
  "usage": null
}
```

## 查询结果

`GET https://ai-api.cprt.xyz/v1/chat/asyncTask/{id}`

返回（200）：

```json
{
  "taskId": "2084118230204809218",
  "status": "SUCCESS",
  "errorCode": "",
  "errorMessage": "",
  "results": [
    { "url": "https://xxx/xxx.mp4", "outputType": "mp4", "text": null, "name": "videoUrl" },
    { "url": null, "outputType": "text", "text": "19246", "name": "seed" }
  ],
  "usage": { "billingSeconds": "4" },
  "failedReason": {}
}
```

- `status`：`QUEUED`（排队中）/ `RUNNING`（运行中）/ `SUCCESS`（成功）/ `FAILED`（失败）
- 成果视频 URL 在 `results[]` 中 `name === "videoUrl"` 的项的 `url` 字段。
