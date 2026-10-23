# Vidu TTS & 声音复刻集成指南

本文档说明如何在 s_tts 的"文案转音频 V2"页面中使用 Vidu API，包括声音复刻和预设音色 TTS。

## 概述

**关键变化：**
- 从 DashScope/CozyVoice 切换到 **Vidu API**（https://api.vidu.cn）
- 使用 `k_n1n_vidu_default` 密钥（在 config/keys.json 中配置）
- **无需轮询**：Vidu TTS 是同步接口，直接返回音频 URL
- 支持两种模式：
  1. **声音复刻 TTS**：上传样本音频，复刻音色后合成语音
  2. **预设音色 TTS**：直接使用 Vidu 提供的预设音色

## API 端点

### 1. 声音复刻（Clone）
```
POST https://api.vidu.cn/ent/v2/audio-clone
Authorization: Token {your_api_key}
```

**请求体：**
```json
{
  "audio_url": "https://example.com/voice_sample.wav",
  "voice_id": "my_custom_voice_001",
  "text": "这是测试文本，用于验证音色复刻效果。",
  "prompt_audio_url": "可选的短示例音频 URL",
  "prompt_text": "可选的示例音频对应文本"
}
```

**响应：**
```json
{
  "task_id": "任务 ID",
  "state": "success|failed|queueing",
  "voice_id": "用户自定义的 voice_id",
  "demo_audio": "试听音频 URL（如果提供了 text 参数）",
  "created_at": "时间戳"
}
```

### 2. 语音合成（TTS）
```
POST https://api.vidu.cn/ent/v2/audio-tts
Authorization: Token {your_api_key}
```

**请求体：**
```json
{
  "text": "要合成的文本内容",
  "voice_setting_voice_id": "音色 ID（预设或复刻的）",
  "voice_setting_speed": 1.0,          // 可选，语速 0.5-2.0
  "voice_setting_volume": 0,           // 可选，音量 0-10，默认 0
  "voice_setting_pitch": 0,            // 可选，语调 -12~12
  "voice_setting_emotion": "calm",     // 可选：happy/sad/angry/fearful/disgusted/surprised/calm
  "pronunciation_dict_tone": ["多音字规则"],  // 可选
  "payload": "透传参数"                  // 可选
}
```

**响应：**
```json
{
  "task_id": "任务 ID",
  "state": "success|failed",
  "file_url": "音频文件 URL",
  "credits": 消耗的积分,
  "payload": "透传参数",
  "created_at": "时间戳"
}
```

## API Manager 配置步骤

### 步骤 1: 在 API Manager 中添加 Vidu 提供商

通过 API Manager 前端 UI 或后端 API 添加 Vidu 提供商：

**API 调用示例：**
```bash
curl -X POST http://localhost:3051/api/v1/providers \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "vidu",
    "base_url": "https://api.vidu.cn/ent/v2",
    "extra_info": {}
  }'
```

记住返回的 `provider.id`（假设为 `1`）。

### 步骤 2: 在 API Manager 中添加模型定义

需要注册两个模型：
- `vidu-clone` - 用于声音复刻
- `vidu-tts` - 用于语音合成

```bash
# 添加 vidu-clone 模型
curl -X POST http://localhost:3051/api/v1/models \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "vidu-clone",
    "preferred_provider": 1,
    "extra_info": {}
  }'

# 添加 vidu-tts 模型
curl -X POST http://localhost:3051/api/v1/models \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "vidu-tts",
    "preferred_provider": 1,
    "extra_info": {}
  }'
```

### 步骤 3: 创建 Vidu API Key

将您的 Vidu API 密钥添加到 API Manager 的密钥表中：

```bash
curl -X POST http://localhost:3051/api/v1/keys \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "k_n1n_vidu_default",
    "provider_id": 1,
    "models": ["vidu-clone", "vidu-tts"],
    "key": "YOUR_ACTUAL_VIDU_API_KEY_FROM_CONSOLE",
    "is_enabled": true,
    "extra_info": {
      "description": "Vidu TTS and voice clone default key"
    }
  }'
```

**重要：** 
- `key` 字段是您从 [Vidu 控制台](https://platform.vidu.cn) 获取的实际 API 密钥
- `models` 数组包含所有使用该密钥支持的模型
- `is_enabled` 设为 `true` 以启用该密钥

### 步骤 4: （可选）为每个密钥设置自定义端点

如果您的 Vidu 密钥有不同的端点，可以在 `provider_model_info` 表中设置：

```bash
# 查看 key_info 表获取 key id
curl http://localhost:3051/api/v1/keys \
  -H "Authorization: Bearer <admin_token>"

# 为特定密钥和模型组合设置端点
curl -X POST http://localhost:3051/api/v1/provider-models \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key_info_id": <key_id_from_above>,
    "model_id": <vidu_model_id>,
    "endpoint": "https://api.vidu.cn/ent/v2",
    "costs": [],
    "extra_info": {}
  }'
```

## 本地开发配置

### 1. 更新 config/keys.json

编辑 `apps/standalone_apps/s_tts/config/keys.json`：

```json
{
    "keys": [
        {"k_n1n_vidu_default": "YOUR_ACTUAL_VIDU_API_KEY"}
    ]
}
```

或者如果您使用 API Manager 动态密钥管理，可以留空占位符，应用会从 API Manager 获取密钥。

### 2. 环境变量（可选）

如果需要配置上传服务地址，可以设置环境变量：

```bash
export VITE_STTS_UPLOAD_BASE_URL="http://your-upload-service.example.com"
```

### 3. 启动应用

```bash
cd apps/standalone_apps/s_tts/frontend
pnpm install
pnpm dev
```

访问 `http://localhost:5173` 并在侧边栏选择"文案转音频 V2"。

## UI 使用说明

### 模式切换

页面顶部提供模式切换按钮：

1. **预设音色 TTS**：适用于快速试用，直接使用 Vidu 提供的公共音色
2. **声音复刻 TTS**：上传自己的音频样本，定制专属音色

### 声音复刻流程

1. 选择"声音复刻 TTS"模式
2. 输入音色前缀（自动生成唯一 voice_id）
3. 上传音频样本或直接填写公网可访问的样本 URL
4. 点击"开始复刻音色"
5. 复刻成功后显示 Voice ID
6. 输入文案，点击"调用 TTS"
7. 实时试听并下载生成的音频

### 预设音色流程

1. 选择"预设音色 TTS"模式
2. 输入预设音色 ID（从 Vidu 音色列表获取）
3. 输入文案
4. 点击"调用 TTS"
5. 试听并下载

## 注意事项

### 音频样本要求（声音复刻）
- 格式：mp3、m4a、wav
- 时长：最少 10 秒，最多 5 分钟
- 文件大小：不超过 20MB
- 内容：需免版权，否则可能被下架

### 声音复刻音色有效期
- 复刻的音色为临时音色
- 需在 **168 小时（7 天）** 内使用，否则会被删除
- 积分不会退还

### Text 参数限制
- 长度小于 10000 字符
- 段落切换用换行符标记
- 支持停顿控制：`<#x#>` 标记（x 为时长，单位秒，范围 0.01-99.99）
  - 示例：`你好<#2#>我是 vidu<#2#>很高兴见到你`

### 多音字发音
可以使用 `pronunciation_dict_tone` 参数定义特殊发音：
```json
[
  "燕少飞/(yan4)(shao3)(fei1)",
  "达菲/(da2)(fei1)",
  "omg/oh my god"
]
```

## Troubleshooting

### 错误：未找到 k_n1n_vidu_default
检查 `config/keys.json` 是否正确配置了新的密钥名。

### 错误：音色复刻失败
- 确认音频样本 URL 可公网访问
- 检查音频格式和时长是否符合要求
- 尝试使用官方示例 URL

### 错误：TTS 生成失败
- 确认 Voice ID 有效（对于复刻模式）
- 检查文本长度和内容
- 查看调用日志中的完整错误信息

### API Manager 相关错误
- 确保 API Manager 后端已启动 (`http://localhost:3051`)
- 确认数据库 migrations 已执行
- 验证 provider、model 和 key 的正确关联

## 参考文档

- [Vidu TTS API 文档](./vidu_tts.md)
- [Vidu 声音复刻 API 文档](./vidu_voice_clone.md)
- [API Manager 调用手册](../../../../moduls/api-manager/docs/api_manager_call_manual.md)

## Changelog

### v2.0.0 (当前版本)
- ✅ 切换到 Vidu API (https://api.vidu.cn)
- ✅ 改用 `k_n1n_vidu_default` 密钥
- ✅ 移除 DashScope/CozyVoice 依赖
- ✅ 简化流程：无需轮询，同步完成
- ✅ 新增模式切换：预设音色 vs 声音复刻
- ✅ 更新 UI 以适配 Vidu API 特性

### v1.x.x (旧版本)
- 使用 DashScope CozyVoice
- 异步音色创建 + 轮询机制
- WebSocket TTS 流式合成

---

**最后更新:** 2026-04-22
