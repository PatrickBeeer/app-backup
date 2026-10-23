> ## Documentation Index
>
> Fetch the complete documentation index at: https://klingai.com/document-api/llms.txt
> Use this file to discover all available pages before exploring further.

# 图生视频

> 来源: https://klingai.com/document-api/api/video/3-0-turbo/image-to-video
> 语言: zh
> 当前 Tab: 图生视频
> 同组 Tab: 文生视频 / 图生视频
> 此内容为面向 LLM 优化的 Markdown，已展开页面内 Tab，并省略页面目录、复制按钮等 UI 控件。

---

## 创建任务

### 接口概览

- Method: `POST`
- Path: `/image-to-video/kling-3.0-turbo`
- Auth: `Authorization: Bearer <API_KEY>`
- Content-Type: `application/json`

### Headers

| 字段 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `Content-Type` | string | 是 | `application/json` | - | 数据交换格式 |
| `Authorization` | string | 是 | - | - | 鉴权信息，参考接口鉴权 |

### Request Body

| 字段路径 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `contents` | array | 是 | - | - | 参考素材合集，如提示词、图片等 |
| `contents[].type` | string | 是 | - | `prompt`, `first_frame` | 素材类型， 支持：提示词、首帧图 |
| `contents[].text` | string | 否 | - | - | type=prompt 时的文本提示词 |
| `contents[].url` | string | 否 | - | - | 首帧图参考素材 |
| `settings` | object | 否 | - | - | 输出配置相关参数，如清晰度、时长等 |
| `settings.resolution` | string | 否 | `720p` | `720p`, `1080p` | 生成视频的清晰度 |
| `settings.duration` | int | 否 | `5` | `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15` | 生成视频时长，单位 s |
| `options` | object | 否 | - | - | 通用配置，如回调地址、是否含水印等 |
| `options.callback_url` | string | 否 | - | - | 本次任务结果回调通知地址 |
| `options.external_task_id` | string | 否 | - | - | 自定义任务ID |
| `options.watermark_info` | object | 否 | - | - | 是否同时生成含水印的结果 |
| `options.watermark_info.enabled` | boolean | 否 | `false` | - | true 为生成，false 为不生成 |

#### Request Body 字段补充说明

- `contents`: 同一个素材的相关字段请放在同一个目录结构中
- `contents`: 参考格式：
  ```json
  "contents": [
    { "type": "prompt", "text": "string" },
    { "type": "first_frame", "url": "https://your-cdn.com/start-frame.jpg" }
  ]
  ```
- `contents[].type`: prompt：提示词素材标识
- `contents[].type`: first_frame：首帧图素材标识
- `contents[].text`: 通过 JSON 的格式定义，具体如下：
  ```json
  {
    "type": "prompt", // 素材类型，固定参数值：prompt；必填
    "text": "string" // 文本提示词，可包含正向描述和负向描述，内容不超过 2500 个字符；必填
  }
  ```
- `contents[].text`: 可将提示词模板化来满足不同的视频生成需求
- `contents[].text`: > **可灵视频3.0 Turbo模型可通过Prompt等内容实现多种能力**
  >
  > 
  > 1. 可通过固定格式生成多镜头视频，格式为“镜头 n, m, words; 镜头 n, m, words;”，用半角符号分隔；其中：
  >
  > 
  >
  >     a. n：分镜序号；最多支持6个分镜，最少支持1个分镜
  >
  > 
  >
  >     b. m：分镜时长；每个分镜时长不小于1，所有分镜时长之和等于当前所生成视频总时长
  >
  > 
  >
  >     c. words：分镜提示词；最大长度512
  >
  > 
  > 2. 更多信息详见：[可灵视频 3.0 模型使用指南](https://docs.qingque.cn/d/home/eZQCqDGoymg61UKgMckSB2oMh?identityId=2Cn18n4EIHT)。
- `contents[].url`: 通过 JSON 的格式定义，具体如下：
  ```json
  {
    "type": "first_frame", // 首帧素材标识，固定参数值：first_frame；必填
    "url": "string" // 素材内容，支持通过 url 或 base64 的方式提供；直接将相关信息填入即可；必填
  }
  ```
- `contents[].url`: 图片格式支持 .jpg / .jpeg / .png
- `contents[].url`: 图片文件大小不能超过 50MB
- `contents[].url`: 图片宽高尺寸不小于 300px，图片宽高比要在 1:2.5 ~ 2.5:1 之间
- `contents[].url`: 支持仅首帧，暂不支持首帧+尾帧和仅尾帧
- `settings.resolution`: 720p：输出清晰度为 720P 的视频
- `settings.resolution`: 1080p：输出清晰度为 1080P 的视频
- `options.callback_url`: 如果配置，服务端会在任务状态发生变更时主动通知
- `options.callback_url`: 具体通知的消息 schema 见 [Callback 协议](https://klingai.com/document-api/api/get-started/callbacks)
- `options.external_task_id`: 传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询
- `options.external_task_id`: 请注意，单用户下需要保证唯一性
- `options.watermark_info`: 通过 enabled 参数定义：
  ```json
  "watermark_info": {
    "enabled": false // 是否生成含水印结果，true 为生成，false 为不生成；默认为 false
  }
  ```
- `options.watermark_info`: 暂不支持自定义水印

### Request Example

```bash
curl --location 'https://api-beijing.klingai.com/image-to-video/kling-3.0-turbo' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {apikey}' \
  --data-raw '{
    "contents": [
      {
        "type": "prompt",
        "text": "A girl sat on the train, looking out the window with a melancholic expression, her head swaying with the train."
      },
      {
        "type": "first_frame",
        "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png"
      }
    ],
    "settings": {
      "resolution": "1080p",
      "duration": 10
    },
    "options": {
      "callback_url": "https://xxx/callback",
      "external_task_id": "",
      "watermark_info": {
        "enabled": true
      }
    }
}'
```

### Response Example

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "id": "893605946402811985", // 被查询的任务ID
    "status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeeded（成功）、failed（失败）
    "create_time": 1781080778802, // 任务创建时间，Unix 时间戳，单位 ms
    "update_time": 1781080794151, // 任务更新时间，Unix 时间戳，单位 ms
    "external_id": "string" // 该任务的自定义任务ID（如有）
  }
}
```

---

## 查询任务（按任务ID）

### 接口概览

- Method: `GET`
- Path: `/tasks`
- Auth: `Authorization: Bearer <API_KEY>`
- Content-Type: `application/json`

### 说明

> 注意：当前API仅支持查询非实时/异步任务

### Headers

| 字段 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `Content-Type` | string | 是 | `application/json` | - | 数据交换格式 |
| `Authorization` | string | 是 | - | - | 鉴权信息，参考接口鉴权 |

### Query Params

| 字段 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `task_ids` | string | 否 | - | - | 需要查询的系统定义的任务ID |
| `external_task_ids` | string | 否 | - | - | 需要查询的自定义任务ID |

#### Query Params 字段补充说明

- `task_ids`: 请求路径参数，直接将值填写在请求路径中
- `task_ids`: 查询任务时，task_ids 与 external_task_ids 两种 ID 至少且只能选择一种，不可同时使用
- `task_ids`: 支持批量查询，用 "," 分隔
- `external_task_ids`: 请求路径参数，直接将值填写在请求路径中
- `external_task_ids`: 查询任务时，task_ids 与 external_task_ids 两种 ID 至少且只能选择一种，不可同时使用
- `external_task_ids`: 支持批量查询，用 "," 分隔

### Request Example

```bash
curl --location 'https://api-beijing.klingai.com/tasks?external_task_ids=123' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {apikey}'
```

### Response Example

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": [
    {
      "id": "893605946402811985", // 被查询的任务ID
      "status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeeded（成功）、failed（失败）
      "message": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "create_time": 1781080778802, // 任务创建时间，Unix 时间戳，单位 ms
      "update_time": 1781080794151, // 任务更新时间，Unix 时间戳，单位 ms
      "external_id": "string", // 该任务的自定义任务ID（如有）
      "outputs": [
        {
          "type": "video", // 生成结果为“视频”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 视频ID，由系统生成
          "url": "string", // 生成结果的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" // 生成的视频的时长，单位：秒
        },
        {
          "type": "image", // 生成结果为“图片”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "url": "string", // 生成结果的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印图片下载URL，防盗链格式
          "group_id": "string" // 仅在生成组图时出现，用于标记分组关系
        },
        {
          "type": "audio", // 生成结果为“音频”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 音频ID，由系统生成
          "mp3_url": "string", // 生成结果的URL，mp3+防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "wav_url": "string", // 生成结果的URL，wav+防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "mp3_duration": "string", // 生成的mp3格式的音频的时长，单位：秒
          "wav_duration": "string" // 生成的wav格式的音频的时长，单位：秒
        },
        {
          "type": "voice", // 生成结果为“音色”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 音色ID，由系统生成
          "name": "string", // 音频名称
          "url": "string", // 试听音频下载链接
          "owned_by": "string", // 音色来源，kling为官方音色库，数字为创作者ID
          "status": "succeeded" // 音色状态，分为正常和已被删除，枚举值分别为：succeeded, deleted
        },
        {
          "type": "element", // 生成结果为“主体”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 主体ID，由系统生成
          "name": "string", // 主体名称
          "description": "string", // 主体描述
          "element_type": "string", // 主体类型，分为视频角色主体和多图主体，枚举值分别为：video_character_elements和multi_image_elements
          "references": [ // 主体相关素材
            {
              "type": "image", // “图片”素材时返回，各内容类型枚举值：image, video, voice
              "role": "string", // 图片参考素材属性，分为正面参考图和其他参考图，枚举值分别为：frontal, refer
              "url": "string" // 素材下载链接
            },
            {
              "type": "video", // “视频”素材时返回，各内容类型枚举值：image, video, voice
              "role": "refer", // 视频参考素材属性，固定值：refer
              "url": "string" // 素材下载链接
            },
            {
              "type": "voice", // “音色”素材时返回，各内容类型枚举值：image, video, voice
              "role": "refer", // 音色参考素材属性，固定值：refer
              "url": "string", // 素材下载链接
              "id": "string", // 音色ID
              "name": "string", // 音色名称
              "owned_by": "string" // 音色来源，kling为官方音色库，数字为创作者ID
            }
          ],
          "owned_by": "string", // 主体来源，kling为官方音色库，数字为创作者ID
          "status": "string", // 主体状态，分为正常和已被删除，枚举值分别为：succeeded, deleted
          "tags": [ // 主体标签相关信息
            {
              "id": 1, // 标签ID
              "name": "string", // 标签名称
              "description": "string" // 标签描述
            }
          ]
        }
      ],
      "billing": [
        {
          "charge_type": "string", // 消耗账户类型，如果消耗的是额度则参数值为cash，如果是消耗资源包则参数值为unit
          "cash_type": "string", // 额度类型，仅存在于消耗额度场景（charge_type=cash）；如果消耗的是正式额度则参数值为balance，如果是消耗的是测试金则参数值为test_balance
          "amount": "string", // 扣减数额；消耗额度场景（charge_type=cash）时代表额度扣减折扣价，消耗资源包场景（charge_type=unit）时代表积分扣减量；十进制
          "currency": "string", // 消耗单位，仅存在于消耗余额场景（charge_type=cash），固定枚举值：CNY, USD
          "package_type": "string", // 消耗资源包类型，仅存在于消耗资源包场景（charge_type=unit），固定枚举值：video, image, audio
          "list_price": "string" // 额度扣减刊例价，仅存在于消耗额度场景（charge_type=cash）
        }
      ]
    }
  ]
}
```

---

## 查询任务（按游标查询）

### 接口概览

- Method: `POST`
- Path: `/tasks`
- Auth: `Authorization: Bearer <API_KEY>`
- Content-Type: `application/json`

### 说明

> 注意：当前API仅支持查询非实时/异步任务

### Headers

| 字段 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `Content-Type` | string | 是 | `application/json` | - | 数据交换格式 |
| `Authorization` | string | 是 | - | - | 鉴权信息，参考接口鉴权 |

### Request Body

| 字段路径 | 类型 | 必填 | 默认值 | 可选值 | 说明 |
|---|---|---:|---|---|---|
| `start_time` | long | 否 | `end_time - 30 天` | - | 任务创建筛选的开始时间 |
| `end_time` | long | 否 | `当前时间` | - | 任务创建筛选的结束时间 |
| `cursor` | string | 否 | - | - | 续页游标，即查询起点 |
| `limit` | int | 否 | `100` | - | 查询任务数量 |
| `filters` | array | 否 | - | - | 查询任务筛选条件，如任务状态、功能类型 |
| `filters[].key` | string | 否 | - | `status`, `product_type` | 筛选维度 |
| `filters[].values` | array | 否 | - | - | 筛选维度对应条件 |

#### Request Body 字段补充说明

- `start_time`: Unix 时间戳，单位 ms
- `start_time`: 默认值为 end_time - 30 天
- `start_time`: 开始时间需早于结束时间
- `end_time`: 默认值为当前时间
- `end_time`: Unix 时间戳，单位 ms
- `end_time`: 结束时间需晚于开始时间
- `cursor`: 参数值来自上次查询时返回的 next_cursor 参数
- `cursor`: 当前参数不为空时，优先基于当前参数值查询，此时开始时间和结束时间参数将失效
- `limit`: 最大值 500；当数量不足 500 时有多少展示多少
- `filters`: 通过 key/value 的方式设置查询条件：
  ```json
  "filters": [
    {
      "key": "status", // 筛选维度，按任务状态筛选，固定参数值：status
      "values": ["succeeded"]
    },
    {
      "key": "product_type", // 筛选维度，按功能类型筛选，固定参数值：product_type
      "values": ["video"]
    }
  ]
  ```
- `filters[].key`: status：按任务状态筛选
  - product_type：按功能类型筛选
- `filters[].values`: status：submitted、processing、succeeded、failed，依次为已提交、生成中、生成成功、生成失败
- `filters[].values`: product_type：video、image、try_on，依次为视频、图像、虚拟试穿

### Request Example

```bash
curl --location 'https://api-beijing.klingai.com/tasks' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer {apikey}' \
  --data '{
    "start_time": 1781193600000,
    "end_time": 1781516352968,
    "cursor": "",
    "limit": 500,
    "filters": [
      {
        "key": "status",
        "values": ["succeeded"]
      },
      {
        "key": "product_type",
        "values": ["video"]
      }
    ]
  }'
```

### Response Example

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "result": [
      {
        "id": "string", // 被查询的任务ID
        "status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeeded（成功）、failed（失败）
        "message": "string", // 任务状态信息，当任务失败时展示失败原因
        "create_time": 1781080778802, // 任务创建时间，Unix 时间戳，单位 ms
        "update_time": 1781080794151, // 任务更新时间，Unix 时间戳，单位 ms
        "external_id": "string", // 该任务的自定义任务ID（如有）
        "outputs": [
        {
          "type": "video", // 生成结果为“视频”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 视频ID，由系统生成
          "url": "string", // 生成结果的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" // 生成的视频的时长，单位：秒
        },
        {
          "type": "image", // 生成结果为“图片”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "url": "string", // 生成结果的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印图片下载URL，防盗链格式
          "group_id": "string" // 仅在生成组图时出现，用于标记分组关系
        },
        {
          "type": "audio", // 生成结果为“音频”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 音频ID，由系统生成
          "mp3_url": "string", // 生成结果的URL，mp3+防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "wav_url": "string", // 生成结果的URL，wav+防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "mp3_duration": "string", // 生成的mp3格式的音频的时长，单位：秒
          "wav_duration": "string" // 生成的wav格式的音频的时长，单位：秒
        },
        {
          "type": "voice", // 生成结果为“音色”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 音色ID，由系统生成
          "name": "string", // 音频名称
          "url": "string", // 试听音频下载链接
          "owned_by": "string", // 音色来源，kling为官方音色库，数字为创作者ID
          "status": "succeeded" // 音色状态，分为正常和已被删除，枚举值分别为：succeeded, deleted
        },
        {
          "type": "element", // 生成结果为“主体”时返回，不同生成内容类型返回值及相关字段会有区别；各内容类型枚举值：image, video, audio, element, voice
          "id": "string", // 主体ID，由系统生成
          "name": "string", // 主体名称
          "description": "string", // 主体描述
          "element_type": "string", // 主体类型，分为视频角色主体和多图主体，枚举值分别为：video_character_elements和multi_image_elements
          "references": [ // 主体相关素材
            {
              "type": "image", // “图片”素材时返回，各内容类型枚举值：image, video, voice
              "role": "string", // 图片参考素材属性，分为正面参考图和其他参考图，枚举值分别为：frontal, refer
              "url": "string" // 素材下载链接
            },
            {
              "type": "video", // “视频”素材时返回，各内容类型枚举值：image, video, voice
              "role": "refer", // 视频参考素材属性，固定值：refer
              "url": "string" // 素材下载链接
            },
            {
              "type": "voice", // “音色”素材时返回，各内容类型枚举值：image, video, voice
              "role": "refer", // 音色参考素材属性，固定值：refer
              "url": "string", // 素材下载链接
              "id": "string", // 音色ID
              "name": "string", // 音色名称
              "owned_by": "string" // 音色来源，kling为官方音色库，数字为创作者ID
            }
          ],
          "owned_by": "string", // 主体来源，kling为官方音色库，数字为创作者ID
          "status": "string", // 主体状态，分为正常和已被删除，枚举值分别为：succeeded, deleted
          "tags": [ // 主体标签相关信息
            {
              "id": 1, // 标签ID
              "name": "string", // 标签名称
              "description": "string" // 标签描述
            }
          ]
        }
      ],
        "billing": [
          {
            "charge_type": "string", // 消耗账户类型，如果消耗的是额度则参数值为cash，如果是消耗资源包则参数值为unit
            "cash_type": "string", // 额度类型，仅存在于消耗额度场景（charge_type=cash）；如果消耗的是正式额度则参数值为balance，如果是消耗的是测试金则参数值为test_balance
            "amount": "string", // 扣减数额；消耗额度场景（charge_type=cash）时代表额度扣减折扣价，消耗资源包场景（charge_type=unit）时代表积分扣减量；十进制
            "currency": "string", // 消耗单位，仅存在于消耗余额场景（charge_type=cash），固定枚举值：CNY, USD
            "package_type": "string", // 消耗资源包类型，仅存在于消耗资源包场景（charge_type=unit），固定枚举值：video, image, audio
            "list_price": "string" // 额度扣减刊例价，仅存在于消耗额度场景（charge_type=cash）
          }
        ]
      }
    ],
    "count": 1, // 查询结果数量
    "next_cursor": "string", // 游标信息，可用于继续查询后续
    "has_more": true // 基于游标信息，是否还有未查询到的数据
  }
}
```
