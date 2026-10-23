# 使用 seedream-5.0-pro

将 `YOUR_API_KEY` 替换为你的密钥即可调用。

## Ark 生图 协议

同步协议，支持返回图片 URL 或 Base64。

### 文生图

```bash title="cURL"
curl https://tokendance.space/gateway/ark/v3/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5.0-pro",
    "prompt": "一张商业摄影感的厨房台面静物，透明玻璃杯里装着柠檬气泡水，清晨侧光，浅景深，干净白色背景。",
    "size": "2K",
    "output_format": "png",
    "response_format": "url",
    "watermark": false
  }'
```

### 图文生图

```bash title="cURL"
curl https://tokendance.space/gateway/ark/v3/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5.0-pro",
    "prompt": "保留原图人物轮廓和站姿，将背景改成清晨的海边栈道，服装改为浅色风衣，整体色调柔和自然。",
    "image": "https://example.com/input.png",
    "size": "2K",
    "output_format": "png",
    "response_format": "url",
    "watermark": false
  }'
```

### 多参考图生图

```bash title="cURL"
curl https://tokendance.space/gateway/ark/v3/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-5.0-pro",
    "prompt": "以图 1 的人物为主体，参考图 2 的配色和夹克款式，生成一张城市街拍风半身照。",
    "image": [
      "https://example.com/person.png",
      "https://example.com/outfit.png"
    ],
    "size": "2K",
    "output_format": "png",
    "response_format": "url",
    "watermark": false
  }'
```

组图、联网搜索、流式输出和完整参数说明见 [Seedream 系列](/docs/ark-image-generations)。

