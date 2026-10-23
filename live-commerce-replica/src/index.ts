import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { probeVideo } from './media/ffmpeg.js';
import { inspectGeneratedClip } from './media/quality.js';
import { renderFinal } from './media/render.js';
import { enableEnvProxy } from './network/env-proxy.js';
import { DeepSeekAnalyzer } from './providers/deepseek-analyzer.js';
import { LocalWhisperTranscriber } from './providers/local-whisper-transcriber.js';
import { CprtProvider } from './providers/cprt.js';
import { PlatformClient } from './providers/platformClient.js';
import {
  MissingMediaPublisher,
  PlatformMediaPublisher,
  PublicBaseMediaPublisher,
  type MediaPublisher
} from './providers/media-publisher.js';
import { DemoGenerator } from './services/demo-generator.js';
import { downloadRemoteVideo, JobWorker } from './services/job-worker.js';
import { NoopBillingService, PlatformBillingService } from './services/billing-service.js';
import { ProjectService } from './services/project-service.js';
import { ReviewService } from './services/review-service.js';
import { ProjectStore } from './store/project-store.js';

const restoreEnvProxy = enableEnvProxy();
const config = loadConfig();
await mkdir(config.dataDir, { recursive: true });
const store = new ProjectStore(config.databasePath);
const provider = new CprtProvider({
  baseUrl: config.cprt.baseUrl,
  ...(config.cprt.apiKey ? { apiKey: config.cprt.apiKey } : {})
});

const platformClient = new PlatformClient({
  gatewayOrigin: config.platform.gatewayOrigin,
  appID: config.platform.appID
});
let publisher: MediaPublisher = new MissingMediaPublisher();
if (config.media.publicBaseUrl) publisher = new PublicBaseMediaPublisher(config.dataDir, config.media.publicBaseUrl);
else if (!config.demoMode) publisher = new PlatformMediaPublisher({
  platformClient,
  objectPathPrefix: `standalone/${config.platform.appID}/jingke`
});

const analyzer = !config.demoMode && config.deepseek.apiKey
  ? new DeepSeekAnalyzer(config.deepseek)
  : undefined;
const transcriber = config.asr.enabled
  ? new LocalWhisperTranscriber({
      model: config.asr.model,
      ffmpegPath: config.ffmpegPath,
      cacheDir: path.join(config.dataDir, 'model-cache')
    })
  : undefined;
const projectService = new ProjectService({
  store,
  dataDir: config.dataDir,
  ffmpegPath: config.ffmpegPath,
  ffprobePath: config.ffprobePath,
  ...(analyzer ? { analyzer } : {}),
  ...(transcriber ? { transcriber } : {})
});
const reviewService = new ReviewService(store);
const billing = config.demoMode
  ? new NoopBillingService()
  : new PlatformBillingService({
      userManagerOrigin: config.billing.userManagerOrigin,
      appID: config.billing.appID,
      videoCostPerSecond: config.billing.videoCostPerSecond
    });
const worker = new JobWorker({
  store,
  provider,
  publisher,
  demoGenerator: new DemoGenerator(config.ffmpegPath),
  billing,
  download: downloadRemoteVideo,
  inspect: (filePath, expected) => inspectGeneratedClip(filePath, expected, config.ffprobePath),
  dataDir: config.dataDir,
  ffmpegPath: config.ffmpegPath,
  videoModel: config.cprt.videoModel,
  fallbackModel: config.cprt.fallbackModel
});
const app = createApp({
  dataDir: config.dataDir,
  demoMode: config.demoMode,
  videoCostPerSecond: config.billing.videoCostPerSecond,
  store,
  projectService,
  reviewService,
  worker,
  probeUpload: (filePath) => probeVideo(filePath, config.ffprobePath),
  render: (project, jobs, outputPath) => renderFinal({
    project,
    jobs,
    outputPath,
    workDir: path.join(config.dataDir, 'projects', project.id, 'render-work'),
    ffmpegPath: config.ffmpegPath
  })
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`镜刻已启动：http://127.0.0.1:${info.port}`);
  console.log(config.demoMode ? '当前为演示模式，不会调用付费 API。' : '当前为真实生成模式。');
});
worker.start();

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  worker.stop();
  await transcriber?.dispose();
  restoreEnvProxy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
