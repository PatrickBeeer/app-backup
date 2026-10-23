> ## Documentation Index
>
> Fetch the complete documentation index at: https://klingai.com/document-api/llms.txt
> Use this file to discover all available pages before exploring further.

# 视频生成

> 来源: https://klingai.com/document-api/api/video/o1/video-omni
> 语言: zh
> 当前 Tab: 视频生成
> 同组 Tab: 视频生成 / 主体管理
> 此内容为面向 LLM 优化的 Markdown，已展开页面内 Tab，并省略页面目录、复制按钮等 UI 控件。

---

## 创建任务

### 接口概览

- Method: `POST`
- Path: `/omni-video/kling-o1`
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
| `contents` | array | 是 | - | - | 参考素材合集，如提示词、图片、主体、视频等 |
| `contents[].type` | string | 是 | - | `prompt`, `first_frame`, `last_frame`, `refer_image`, `feature_video`, `base_video`, `element` | 素材类型，支持：提示词、参考图、参考视频、主体 |
| `settings` | object | 否 | - | - | 输出配置相关参数，如清晰度、时长等 |
| `settings.audio` | string | 否 | `off` | `original`, `off` | 是否生成带有声音的视频 |
| `settings.resolution` | string | 否 | `720p` | `720p`, `1080p` | 生成视频的清晰度 |
| `settings.aspect_ratio` | string | 否 | `16:9` | `16:9`, `9:16`, `1:1` | 生成视频的画面纵横比（宽:高） |
| `settings.duration` | int | 否 | `5` | `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10` | 生成视频时长，单位s |
| `options` | object | 否 | - | - | 通用配置，如回调地址、是否含水印等 |
| `options.callback_url` | string | 否 | - | - | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知 |
| `options.external_task_id` | string | 否 | - | - | 自定义任务ID |
| `options.watermark_info` | object | 否 | - | - | 是否同时生成含水印的结果 |

#### Request Body 字段补充说明

- `contents`: 参考格式如下，参数说明详见下文：
- `contents`: ```json
  "contents": [
    {
      "type": "prompt",
      "text": "string"
    },
    {
      "type": "first_frame",
      "url": "string",
      "id": "string"
    },
    {
      "type": "last_frame",
      "url": "string",
      "id": "string"
    },
    {
      "type": "refer_image",
      "url": "string",
      "id": "string"
    },
    {
      "type": "feature_video",
      "url": "string",
      "id": "string"
    },
    {
      "type": "base_video",
      "url": "string",
      "id": "string"
    },
    {
      "type": "element",
      "element_id": "string",
      "id": "string"
    }
  ]
  ```
- `contents[].type`: `prompt`：提示词素材标识。
  - `first_frame`：首帧图素材标识。
  - `last_frame`：尾帧图素材标识。
  - `refer_image`：元素参考图素材标识。
  - `feature_video`：特征参考视频素材标识。
  - `base_video`：待编辑视频素材标识。
  - `element`：主体素材标识。
- `contents[].type.prompt`: 通过JSON的格式定义，具体如下：
  
  ```json
  {
    "type": "prompt", // 素材类型，固定参数值：prompt；必填
    "text": "string" // 文本提示词，可包含正向描述和负向描述，内容不超过 2500 个字符；必填
  }
  ```
  
  - 可将提示词模板化来满足不同的视频生成需求：
- `contents[].type.prompt`: > **可灵视频O1模型可通过Prompt等内容实现多种能力**
  >
  > 
  > 1. 可通过@xxx的格式来指定某张图片、某个主体、某个视频，如：@image_1、@Zhang、@video_1。
  >
  > 
  > 2. 请避免不同主体名称存在包含关系，如：@Zhang 与 @ZhangSan。
  >
  > 
  > 3. 请避免主体名称与Prompt雷同，如：@gmail 与 xxx@gmail.com。
  >
  > 
  > 4. 更多信息详见：[可灵 O1 模型使用指南](https://docs.qingque.cn/d/home/eZQCg5xHvxDaE-jP2GcnaNc6O?identityId=2Cn18n4EIHT)。
- `contents[].type.first_frame / last_frame / refer_image`: 图片可作为场景、风格等参考图，也可作为首帧或尾帧生成视频。
  - 通过JSON的格式定义，具体如下：
  
  ```json
  {
    "type": "string", // 首帧图、尾帧图或元素参考图素材标识，依次对应枚举值：first_frame、last_frame、refer_image；必填
    "url": "string", // 素材内容，支持通过url或base64的方式提供；直接将相关信息填入即可；必填
    "id": "string" // 素材索引ID，用于在prompt中指定，同任务中当前参数不得重复；选填
  }
  ```
  
  - 图片格式支持.jpg / .jpeg / .png。
  - 图片文件大小不能超过50MB。
  - 图片宽高尺寸不小于300px，图片宽高比要在1:2.5 ~ 2.5:1之间。
  - 图片数量上限与参考主体数量和参考主体类型有关，其中：
    - 无参考视频+有多图主体时，参考图片与多图主体数量之和不得超过7。
    - 有参考视频+有多图主体时，参考图片与多图主体数量之和不得超过4。
  - 当图片作为首帧或尾帧使用时：
    - 支持仅首帧和首尾帧，暂不支持仅尾帧。
    - 使用首尾帧时，不支持添加更多参考图。
- `contents[].type.feature_video / base_video`: 通过JSON的格式定义，具体如下：
  
  ```json
  {
    "type": "string", // 视频素材标识，视频可作为特征参考视频，也可作为待编辑视频，依次对应枚举值：feature_video、base_video；必填
    "url": "string", // 素材内容，支持通过url的方式提供；直接将相关信息填入即可；必填
    "id": "string" // 素材索引ID，用于在prompt中指定，同任务中当前参数不得重复；选填
  }
  ```
  
  - 视频格式支持.mp4 / .mov。
  - 视频文件大小不能超过200MB。
  - 视频时长需介于3秒（含）和10秒（含）之间。
  - 视频宽高尺寸需介于700px（含）和2160px（含）之间。
  - 视频帧率基于24fps～60fps（生成视频的帧率为24fps）。
  - 最多添加1段参考视频。
  - 当视频作为特征参考视频使用时：
    - 仅支持定义视频首帧，不支持定义视频尾帧。
  - 当视频作为待编辑视频使用时：
    - 不支持定义视频首帧或尾帧。
- `contents[].type.element`: 通过JSON的格式定义，具体如下：
  
  ```json
  {
    "type": "element", // 素材类型，固定参数值：element；必填
    "element_id": "string", // 主体ID，由系统生成，通过查询主体相关API返回；必填
    "id": "string" // 素材索引ID，用于在prompt中指定，同任务中当前参数不得重复；必填
  }
  ```
  
  - 主体分为通过视频定制的主体（简称：视频角色主体）和通过图片定制的主体（简称：多图主体）；当前模型仅支持多图主体，不支持视频角色主体。
  - 主体数量上限与主体类型、参考图片数量、有无参考视频等因素有关，其中：
    - 使用首尾帧生成视频时，不支持主体。
    - 无参考视频时，参考图片与主体数量之和不得超过7。
    - 有参考视频时，参考图片与主体数量之和不得超过4。
- `settings.audio`: `original`：生成的视频保留参考视频原声。
  - `off`：生成的视频不含有声音。
- `settings.resolution`: `720p`：输出清晰度为720P的视频。
  - `1080p`：输出清晰度为1080P的视频。
- `settings.aspect_ratio`: 当没有首帧图且没有参考视频时，当前参数必填。
- `settings.duration`: 使用首帧图生成视频且无其他参考图（refer_image）和参考视频（feature_video/base_video）时，仅支持生成5秒或10秒的视频。
- `options`: ```json
  "options": {
    "callback_url": "https://example.com/cb", // 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知；具体通知的消息schema见“Callback协议”
    "external_task_id": "string", // 自定义任务ID，可用于查询，不会覆盖系统生成的任务ID，需在账号范围内保证唯一性
    "watermark_info": {
      "enabled": false // 是否生成含水印结果，true为生成，false为不生成；默认为false
    }
  }
  ```
- `options.callback_url`: 具体通知的消息schema见 [Callback协议](https://klingai.com/document-api/api/get-started/callbacks)。
- `options.external_task_id`: 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询。
- `options.external_task_id`: 请注意，单用户下需要保证唯一性。
- `options.watermark_info`: 通过enabled参数定义，具体object格式如下：
- `options.watermark_info`: ```json
  "watermark_info": {
    "enabled": boolean // 是否生成含水印结果，true为生成，false为不生成；默认为false
  }
  ```
- `options.watermark_info`: 暂不支持自定义水印。

### Request Example

```bash
curl --location 'https://api-beijing.klingai.com/omni-video/kling-o1' \
--header 'Authorization: Bearer {apikey}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "contents": [
        {
            "type": "prompt",
            "text": "A girl sat on the train, looking out the window with a melancholic expression, her head swaying with the train."
        },
        {
            "type": "first_frame",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png",
            "id": "image_1"
        },
        {
            "type": "refer_image",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png",
            "id": "image_2"
        }
    ],
    "settings": {
        "resolution": "1080p",
        "duration": 3,
        "audio": "off"
    },
    "options": {
        "callback_url": "https://xxx/callback",
        "external_task_id": ""
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
    "id": "string", // 系统生成的任务ID
    "status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeeded（成功）、failed（失败）
    "create_time": 1781080778802, // 任务创建时间，Unix时间戳、单位ms
    "update_time": 1781080794151, // 任务更新时间，Unix时间戳、单位ms
    "external_id": "string" // 该任务的自定义任务ID（如有）
  }
}
```

## 更多场景调用示例

### 首帧+参考图

```cURL
curl --location 'https://api-beijing.klingai.com/omni-video/kling-o1' \
--header 'Authorization: Bearer {apikey}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "contents": [
        {
            "type": "prompt",
            "text": "A girl sat on the train, looking out the window with a melancholic expression, her head swaying with the train."
        },
        {
            "type": "first_frame",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png",
            "id": "image_1"
        },
        {
            "type": "refer_image",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_25.png",
            "id": "image_2"
        }
    ],
    "settings": {
        "resolution": "1080p",
        "duration": 3,
        "audio": "off"
    },
    "options": {
        "callback_url": "https://xxx/callback",
        "external_task_id": ""
    }
}'
```

### 首帧图+多图主体+视频特征参考

```cURL
curl --location 'https://api-beijing.klingai.com/omni-video/kling-o1' \
--header 'Authorization: Bearer {apikey}' \
--header 'Content-Type: application/json' \
--data '{
    "contents": [
        {
            "type": "prompt",
            "text": "Change the color of the parrot’s feathers to match the reference image. Keep all other elements of the video unchanged."
        },
        {
            "type": "element",
            "element_id": "161",
            "id": "element_1"
        },
        {
            "type": "first_frame",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_7.1.png",
            "id": "image_1"
        },
        {
            "type": "feature_video",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/video_7.1.mp4",
            "id": "video_1"
        }
    ],
    "settings": {
        "resolution": "1080p",
        "aspect_ratio": "16:9",
        "audio": "off"
    },
    "options": {
        "callback_url": "https://xxx/callback",
        "external_task_id": ""
    }
}'
```

### 视频编辑+参考图

```cURL
curl --location 'https://api-beijing.klingai.com/omni-video/kling-o1' \
--header 'Authorization: Bearer {apikey}' \
--header 'Content-Type: application/json' \
--data '{
    "contents": [
        {
            "type": "prompt",
            "text": "Change the color of the parrot’s feathers to match the reference image. Keep all other elements of the video unchanged."
        },
        {
            "type": "refer_image",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/image_7.1.png",
            "id": "image_1"
        },
        {
            "type": "base_video",
            "url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-tob-release_note/video_7.1.mp4",
            "id": "video_1"
        }
    ],
    "settings": {
        "resolution": "1080p",
        "aspect_ratio": "16:9",
        "audio": "off"
    },
    "options": {
        "callback_url": "https://xxx/callback",
        "external_task_id": ""
    }
}'
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
| `start_time` | string | 否 | `end_time - 30 天` | - | 任务创建筛选的开始时间 |
| `end_time` | string | 否 | `当前时间` | - | 任务创建筛选的结束时间 |
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
    "start_time": "1781193600000",
    "end_time": "1781516352968",
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
            "charge_type": "string", // 消耗账户类型，如果消耗的是额度则参数值为 cash，如果消耗资源包则参数值为 unit
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
