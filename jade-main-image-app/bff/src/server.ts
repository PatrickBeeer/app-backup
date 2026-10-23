// Small BFF for the jade-main-image-app standalone app.
//
// Purpose: keep the GPT Image 2 provider key server-side so the browser never
// sees it. The Vite frontend calls POST /api/gpt-image with prompt + image +
// ratio; this server forwards to the GPT Image 2 endpoint using GPT_API_KEY
// from the environment and returns the generated image as base64.
//
// Note on billing: GPT Image calls through this BFF bypass app-manager pricing
// (no billing_task). This is accepted for v1; see the integration plan's "Open
// Items Flagged for User" for the rationale and follow-up options.

import express from "express";

const port = Number(process.env.PORT || 5051);
const gptEndpoint = process.env.GPT_IMAGE_ENDPOINT || `${(process.env.GPT_BASE_URL || "https://147ai.com").replace(/\/$/, "")}/v1/images/edits`;
const gptKey = (process.env.GPT_API_KEY || "").trim();
const timeoutMs = Number(process.env.GPT_IMAGE_TIMEOUT || 600) * 1000;

type Ratio = "1:1" | "16:9" | "9:16" | "3:4";

const sizeForRatio: Record<Ratio, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "3:4": "1024x1536",
};

function timeoutSignal() {
  return AbortSignal.timeout(timeoutMs);
}

function cleanBase64(value: string) {
  return value.startsWith("data:image/") ? value.split(",", 2)[1] : value;
}

function toBuffer(value: string) {
  return Buffer.from(cleanBase64(value), "base64");
}

function extractImage(payload: unknown): string | null {
  if (typeof payload === "string") return payload.startsWith("data:image/") ? cleanBase64(payload) : null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractImage(item);
      if (found) return found;
    }
  }
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    for (const key of ["b64_json", "base64", "data", "image", "image_url", "url"]) {
      const value = source[key];
      if (typeof value === "string" && value.length > 200) return cleanBase64(value);
      const found = extractImage(value);
      if (found) return found;
    }
    for (const value of Object.values(source)) {
      const found = extractImage(value);
      if (found) return found;
    }
  }
  return null;
}

async function fetchImageUrl(url: string) {
  const response = await fetch(url, { signal: timeoutSignal() });
  if (!response.ok) throw new Error(`图片下载失败：${response.status}`);
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

async function callGpt(prompt: string, imageBase64: string, mime: string, ratio: Ratio): Promise<string> {
  if (!gptKey) throw new Error("缺少 GPT_API_KEY 环境变量");
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", sizeForRatio[ratio] || "1024x1024");
  form.append("image", new Blob([toBuffer(imageBase64)], { type: mime || "image/png" }), "product.png");

  const response = await fetch(gptEndpoint, {
    method: "POST",
    headers: { Authorization: gptKey },
    body: form,
    signal: timeoutSignal(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GPT Image 2 ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }

  const image = extractImage(body);
  if (image) return image;

  const url = (body as any)?.data?.[0]?.url;
  if (url) return fetchImageUrl(url);

  throw new Error("GPT Image 2 未返回图像");
}

const app = express();
app.use(express.json({ limit: "80mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/gpt-image", async (req, res) => {
  const body = req.body || {};
  const { prompt, imageBase64, mime, ratio } = body;
  if (typeof imageBase64 !== "string" || imageBase64.length < 100) {
    return res.status(400).json({ error: "缺少 imageBase64" });
  }
  const validRatios: Ratio[] = ["1:1", "16:9", "9:16", "3:4"];
  const resolvedRatio = validRatios.includes(ratio) ? (ratio as Ratio) : "1:1";
  try {
    const image = await callGpt(
      typeof prompt === "string" ? prompt : "",
      imageBase64,
      typeof mime === "string" ? mime : "image/png",
      resolvedRatio
    );
    res.json({ image });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`jade-main-image-app BFF listening on http://127.0.0.1:${port}`);
});
