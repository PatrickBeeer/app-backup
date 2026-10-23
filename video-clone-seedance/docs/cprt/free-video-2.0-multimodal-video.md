# 创建

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/chat/asyncTask:
    post:
      summary: 创建
      deprecated: false
      description: >-
        #### 请求参数说明


        | 参数说明 | 类型 | 必填/可选 | AI 应用程序生成的结果。 |

        | --- | --- | --- | --- |

        | `model` | String | 必填 | free-video-2.0-multimodal-video |

        | `prompt` | String | 必填 | 视频生成提示词<br>文本长度限制: 1 - 20480 |

        | `resolution` | String | 必填 |
        视频分辨率。分为模型原生输出的分辨率（480p、720p、native1080p、native4k）|

        | `duration` | String | 必填 | 视频时长（秒）<br>枚举值: [-1, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15] |

        | `imageUrls` | List(String) | 可选 | 参考图片（0-9张）<br>最多支持 9 项图片，每张 30 MB |

        | `videoUrls` | List(String) | 可选 | 参考视频（0-3个，用于多模态参考/视频编辑/视频续写）。单个视频时长
        [2, 15] s，最多传入 3 个参考视频，所有视频总时长不超过 15s。<br>最多支持 3 项视频，每个 50 MB |

        | `audioUrls` | List(String) | 可选 | 参考音频（0-3个，需至少包含1个参考视频或图片）。单个音频时长 [2,
        15] s，最多传入 3 段参考音频，所有音频总时长不超过 15 s。<br>最多支持 3 项音频，每个 15 MB |

        | `generateAudio` | Boolean | 可选 | 是否生成视频音频 |

        | `ratio` | String | 可选 | 视频宽高比<br>枚举值: [adaptive, 16:9, 4:3, 1:1, 3:4,
        9:16, 21:9] |

        | `realPersonMode` | Boolean | 可选 | 真人模式 |

        | `conversionSlots` | List(String) | 可选 | 真人素材资产化槽位，多选；all
        表示所有图片/视频槽位都做资产化。<br>枚举值: [all, image1, image2, image3, image4, image5,
        image6, image7, image8, image9, video1, video2, video3] |

        | `returnLastFrame` | Boolean | 可选 | 是否返回视频尾帧图片 |

        | `seed` | Int | 可选 | 种子整数，用于控制生成内容的随机性。<br>输入范围值: -1 - 2147483647 |

        | `returnOriginData` | Boolean | 可选 | 返还原始链接URL|
      tags:
        - free-video/free-video-2.0-multimodal-video
      parameters:
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties: {}
              x-apifox-orders: []
            example:
              model: free-video-2.0-multimodal-video
              prompt: 一只小狗在金秋麦田中奔跑，航拍视角，动画风格，电影级画面
              resolution: 720p
              duration: 4
              returnOriginData: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    description: >-
                      状态，常见状态：QUEUED (排队中), RUNNING (运行中), SUCCESS (成功), FAILED
                      (失败) 
                x-apifox-orders:
                  - status
                required:
                  - status
              example:
                taskId: 20260803112441_705gvSzDMMTcYLrPNikA6
                status: QUEUED
                errorCode: ''
                errorMessage: ''
                results: null
                clientId: ''
                promptTips: ''
                failedReason: {}
                usage: null
                parentTaskId: null
                taskUsageList: null
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: free-video/free-video-2.0-multimodal-video
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/8157295/apis/api-497080549-run
components:
  schemas: {}
  securitySchemes:
    Authorization:
      type: bearer
      scheme: bearer
servers:
  - url: https://ai-api.cprt.xyz
    description: 正式环境
security: []

```