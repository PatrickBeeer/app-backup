import path from 'node:path';
import { z } from 'zod';

const booleanValue = z
  .string()
  .optional()
  .transform((value) => value?.trim().toLowerCase() !== 'false');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3013),
  DEMO_MODE: booleanValue,
  DATA_DIR: z.string().default('./data'),
  CPRT_BASE_URL: z.string().url().default('https://ai-api.cprt.xyz'),
  CPRT_API_KEY: z.string().optional(),
  // 主视频模型：XG-MASTER-VIDEO-2.5（智算谷转发的火山 Seedance 2.5 多模态）。
  // 使用火山原生 content[] 数组契约（reference_image/reference_video/first_frame
  // 等 role），而非已失效的 free-video-2.x 的 imageUrls/videoUrls 契约。
  CPRT_VIDEO_MODEL: z.string().default('XG-MASTER-VIDEO-2.5'),
  // 备用模型：主模型提交失败时改用首尾帧 i2v 兜底——与主模型同为 XG-MASTER-VIDEO-2.5，
  // 仅 payload 形态不同（i2v 用 first_frame/last_frame 图片，省略 ratio）。
  CPRT_FALLBACK_MODEL: z.string().default('XG-MASTER-VIDEO-2.5'),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash'),
  LOCAL_ASR_ENABLED: booleanValue,
  WHISPER_MODEL: z.string().default('onnx-community/whisper-small'),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal('')),
  // 经 app-manager 调用 api-manager 的 COS presign 上传端点所需的网关入口。
  PLATFORM_GATEWAY_ORIGIN: z.string().url().default('http://127.0.0.1:80'),
  // user-manager 后端地址，用于视频生成扣费（/api/v1/user/credits/deduct）。
  USER_MANAGER_ORIGIN: z.string().url().default('http://127.0.0.1:3003'),
  // 视频生成每秒费用（积分/秒）。
  VIDEO_COST_PER_SECOND: z.coerce.number().int().min(0).optional(),
  // 兼容卖点可视化应用中的 Seedance 每秒计费配置名称。
  SEEDANCE_VIDEO_PER_SECOND: z.coerce.number().int().min(0).optional(),
  SEEDANCE_VIDEO_COST_PER_SECOND: z.coerce.number().int().min(0).optional(),
  seedance_video_per_second: z.coerce.number().int().min(0).optional(),
  seedance_video_cost_per_second: z.coerce.number().int().min(0).optional(),
  STANDALONE_APP_ID: z.string().default('live-commerce-replica'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  // Linux 默认字体路径；容器部署时需安装 fonts-wqy-microhei 或 fonts-noto-cjk。
  SUBTITLE_FONT_FILE: z.string().default('/usr/share/fonts/truetype/wqy/wqy-microhei.ttc')
});

export interface AppConfig {
  port: number;
  demoMode: boolean;
  dataDir: string;
  databasePath: string;
  cprt: {
    baseUrl: string;
    apiKey?: string;
    videoModel: string;
    fallbackModel: string;
  };
  deepseek: {
    baseUrl: string;
    apiKey?: string;
    model: string;
  };
  asr: {
    enabled: boolean;
    model: string;
  };
  media: {
    publicBaseUrl?: string;
  };
  platform: {
    gatewayOrigin: string;
    appID: string;
  };
  billing: {
    userManagerOrigin: string;
    appID: string;
    videoCostPerSecond: number;
  };
  ffmpegPath: string;
  ffprobePath: string;
  subtitleFontFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const parsed = envSchema.parse(env);
  const dataDir = path.resolve(cwd, parsed.DATA_DIR);
  const cprtApiKey = parsed.CPRT_API_KEY?.trim();
  const deepseekApiKey = parsed.DEEPSEEK_API_KEY?.trim();
  const publicBaseUrl = parsed.MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const videoCostPerSecond = [
    parsed.VIDEO_COST_PER_SECOND,
    parsed.SEEDANCE_VIDEO_PER_SECOND,
    parsed.SEEDANCE_VIDEO_COST_PER_SECOND,
    parsed.seedance_video_per_second,
    parsed.seedance_video_cost_per_second
  ].find((value): value is number => Number.isFinite(value)) ?? 15;

  return {
    port: parsed.PORT,
    demoMode: parsed.DEMO_MODE,
    dataDir,
    databasePath: path.join(dataDir, 'jingke.sqlite'),
    cprt: {
      baseUrl: parsed.CPRT_BASE_URL.replace(/\/$/, ''),
      ...(cprtApiKey ? { apiKey: cprtApiKey } : {}),
      videoModel: parsed.CPRT_VIDEO_MODEL,
      fallbackModel: parsed.CPRT_FALLBACK_MODEL
    },
    deepseek: {
      baseUrl: parsed.DEEPSEEK_BASE_URL.replace(/\/$/, ''),
      ...(deepseekApiKey ? { apiKey: deepseekApiKey } : {}),
      model: parsed.DEEPSEEK_MODEL
    },
    asr: {
      enabled: parsed.LOCAL_ASR_ENABLED,
      model: parsed.WHISPER_MODEL
    },
    media: {
      ...(publicBaseUrl ? { publicBaseUrl } : {})
    },
    platform: {
      gatewayOrigin: parsed.PLATFORM_GATEWAY_ORIGIN.replace(/\/$/, ''),
      appID: parsed.STANDALONE_APP_ID
    },
    billing: {
      userManagerOrigin: parsed.USER_MANAGER_ORIGIN.replace(/\/$/, ''),
      appID: parsed.STANDALONE_APP_ID,
      videoCostPerSecond
    },
    ffmpegPath: parsed.FFMPEG_PATH,
    ffprobePath: parsed.FFPROBE_PATH,
    subtitleFontFile: parsed.SUBTITLE_FONT_FILE
  };
}
