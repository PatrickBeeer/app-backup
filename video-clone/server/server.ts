import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { config } from './config';
import {
  createCloneVideoTask,
  getCloneVideoTask,
  resolveVideoDeployment,
  type VideoDeploymentKey,
} from './kling';
import { generateSubjectReplacedFrame } from './seedream';
import {
  createCloneSpeechTask,
  getCloneSpeechTask,
  resolveSpeechDeployment,
  resolveSpeechPipeline,
} from './speech';
import {
  downloadImageAsDataUri,
  extractAudioFromVideoToUpload,
  extractVideoFramesToDataUris,
  inspectVideo,
  mergeVideoAndAudioToUpload,
  trimVideoToUpload,
} from './media';

type RunBody = {
  action?: string;
  [key: string]: unknown;
};

type CloneJobRecord = {
  jobId: string;
  videoTaskId: string;
  speechTaskId: string;
  videoDeploymentKey: VideoDeploymentKey;
  videoDeploymentName: string;
  audioResultUrl: string;
  mergedVideoUploadUrl: string;
  mergedVideoUploadHeaders: Record<string, string>;
  mergedVideoPublicUrl: string;
  finalVideoUrl: string | null;
  createdAt: number;
};

const cloneJobs = new Map<string, CloneJobRecord>();
const JOB_TTL_MS = 12 * 60 * 60 * 1000;
const STALE_RUNNING_TASK_MS = 10 * 60 * 1000;
const STALE_SUBMITTED_TASK_MS = 3 * 60 * 1000;

class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

function cleanupJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of cloneJobs) {
    if (job.createdAt + JOB_TTL_MS <= now) {
      cloneJobs.delete(jobId);
    }
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<RunBody> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 2 * 1024 * 1024) {
      throw new UserError('Request body is too large.', 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new UserError('Request body must be valid JSON.', 400);
  }
}

function requireString(body: RunBody, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new UserError(`Missing required string field: ${key}`);
  }
  return value.trim();
}

function optString(body: RunBody, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireDuration(body: RunBody): number {
  const value = Number(body.durationSeconds);
  if (!Number.isFinite(value) || value < 3 || value > 15) {
    throw new UserError('durationSeconds must be between 3 and 15.');
  }
  return Number(value.toFixed(1));
}

function requireResolution(body: RunBody): '720p' | '1080p' {
  const value = String(body.resolution || '').trim();
  if (value === '720p' || value === '1080p') {
    return value;
  }
  throw new UserError('resolution must be 720p or 1080p.');
}

function parseVideoDeploymentKey(body: RunBody): VideoDeploymentKey {
  const value = String(body.videoDeploymentKey || 'motion_control').trim();
  if (value === 'motion_control' || value === 'omni' || value === 'kling_3' || value === 'turbo') {
    return value;
  }
  throw new UserError('videoDeploymentKey must be motion_control, omni, kling_3, or turbo.');
}

function normalizeStatus(status: string): 'queued' | 'running' | 'completed' | 'failed' {
  const normalized = String(status || '').trim().toLowerCase();
  if (['completed', 'done', 'success', 'succeeded', 'succeed', 'finished'].includes(normalized)) {
    return 'completed';
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(normalized)) {
    return 'failed';
  }
  if (['queued', 'submitted'].includes(normalized)) {
    return 'queued';
  }
  return 'running';
}

function isTaskStale(status: {
  status: string;
  createdAt: number | null;
  updatedAt: number | null;
  providerTaskStatus?: string | null;
  providerCreatedAt?: number | null;
  providerUpdatedAt?: number | null;
}): boolean {
  const normalized = normalizeStatus(status.status);
  if (normalized !== 'running') {
    return false;
  }
  const providerTaskStatus = String(status.providerTaskStatus || '').trim().toLowerCase();
  const thresholdMs = providerTaskStatus === 'submitted' || providerTaskStatus === 'queued'
    ? STALE_SUBMITTED_TASK_MS
    : STALE_RUNNING_TASK_MS;
  const lastActiveAt = status.providerUpdatedAt ?? status.providerCreatedAt ?? status.updatedAt ?? status.createdAt;
  return Number.isFinite(lastActiveAt) && (lastActiveAt as number) > 0 && (Date.now() - (lastActiveAt as number)) >= thresholdMs;
}

function buildStaleTaskMessage(kind: 'video' | 'speech', status: {
  status: string;
  updatedAt: number | null;
  providerStatus: string | null;
  providerTaskStatus: string | null;
  progress: number | null;
  providerCreatedAt?: number | null;
  providerUpdatedAt?: number | null;
}): string {
  const label = kind === 'video' ? '视频生成任务' : '语音转换任务';
  const lastActiveAt = status.updatedAt;
  const providerLastActiveAt = status.providerUpdatedAt ?? status.providerCreatedAt ?? null;
  const effectiveLastActiveAt = providerLastActiveAt ?? lastActiveAt;
  const staleMinutes = Number.isFinite(effectiveLastActiveAt) && (effectiveLastActiveAt ?? 0) > 0
    ? Math.max(1, Math.round((Date.now() - (effectiveLastActiveAt as number)) / 60000))
    : null;
  const detailParts = [
    `当前状态：${status.status || 'unknown'}`,
    status.providerStatus ? `平台状态：${status.providerStatus}` : '',
    status.providerTaskStatus ? `上游状态：${status.providerTaskStatus}` : '',
    Number.isFinite(status.progress) ? `进度：${status.progress}%` : '',
  ].filter(Boolean);
  const stalePart = staleMinutes ? `已超过 ${staleMinutes} 分钟未更新` : '长时间未更新';
  return `${label}${stalePart}（${detailParts.join(' / ')}），疑似上游卡住，请重试。`;
}

async function generateCloneFrameUrls(input: {
  imageUrl: string;
  referenceVideoUrl: string;
  durationSeconds: number;
  seedreamPrompt?: string;
}): Promise<string[]> {
  const [referenceImageDataUri, extractedFrames] = await Promise.all([
    downloadImageAsDataUri(input.imageUrl),
    extractVideoFramesToDataUris({
      sourceVideoUrl: input.referenceVideoUrl,
      frameCount: 1,
      durationSeconds: input.durationSeconds,
    }),
  ]);

  if (!extractedFrames.length) {
    throw new Error('未能从参考视频中提取关键帧。');
  }

  const generatedFrameUrls = await Promise.all(extractedFrames.map(async (frame, framePosition) => {
    const frameImage = frame.dataUri;
    extractedFrames[framePosition] = {
      ...frame,
      dataUri: '',
    };
    const generatedUrl = await generateSubjectReplacedFrame({
      frameImage,
      referenceImage: referenceImageDataUri,
      prompt: input.seedreamPrompt,
    });
    return String(generatedUrl || '').trim();
  }));

  return generatedFrameUrls.filter(Boolean);
}

async function dispatch(body: RunBody): Promise<unknown> {
  cleanupJobs();
  const action = String(body.action || '').trim();

  switch (action) {
    case 'health': {
      const [videoDeployment, omniDeployment, speechDeployment] = await Promise.all([
        resolveVideoDeployment('motion_control'),
        resolveVideoDeployment('omni'),
        resolveSpeechDeployment(),
      ]);
      const speechPipeline = resolveSpeechPipeline();
      return {
        status: 'ok',
        service: 'video-clone-bff',
        hasKlingKey: Boolean(config.klingApiKey),
        hasTokendanceKey: Boolean(config.tokendanceApiKey),
        hasDensKey: Boolean(config.densApiKey),
        hasElevenLabsKey: Boolean(config.elevenLabsApiKey),
        videoDeployment: videoDeployment.deployment_name,
        diagnosticVideoDeployments: [
          { key: 'motion_control', name: videoDeployment.deployment_name },
          { key: 'omni', name: omniDeployment.deployment_name },
        ],
        speechDeployment: speechDeployment.deployment_name,
        speechPipeline,
        voiceId: config.elevenLabsVoiceId,
      };
    }

    case 'inspect_reference_video': {
      const sourceUrl = requireString(body, 'sourceUrl');
      const inspection = await inspectVideo(sourceUrl);
      return inspection;
    }

    case 'start_kling_video_task': {
      const imageUrl = requireString(body, 'imageUrl');
      const referenceVideoUrl = optString(body, 'referenceVideoUrl');
      const aspectRatio = requireString(body, 'aspectRatio') as '16:9' | '9:16';
      const durationSeconds = requireDuration(body);
      const resolution = requireResolution(body);
      const videoDeploymentKey = parseVideoDeploymentKey(body);
      const prompt = requireString(body, 'prompt');
      const selectedVideoDeployment = await resolveVideoDeployment(videoDeploymentKey);
      const videoTask = await createCloneVideoTask({
        imageUrl,
        referenceVideoUrl,
        aspectRatio,
        durationSeconds,
        resolution,
        prompt,
        videoDeploymentKey,
      });

      return {
        taskId: videoTask.taskId,
        status: videoTask.status,
        videoDeploymentKey: selectedVideoDeployment.deployment_key,
        videoDeploymentName: selectedVideoDeployment.deployment_name,
        requestedVideoDeploymentKey: selectedVideoDeployment.requested_key,
      };
    }

    case 'get_kling_video_task': {
      const taskId = requireString(body, 'taskId');
      const task = await getCloneVideoTask(taskId);
      return {
        taskId: task.id,
        status: task.status,
        errorMessage: task.errorMessage,
        videoUrl: task.videoUrl,
        progress: task.progress,
      };
    }

    case 'generate_clone_frames': {
      const imageUrl = requireString(body, 'imageUrl');
      const referenceVideoUrl = requireString(body, 'referenceVideoUrl');
      const durationSeconds = requireDuration(body);
      const seedreamPrompt = optString(body, 'seedreamPrompt');
      const frameUrls = await generateCloneFrameUrls({
        imageUrl,
        referenceVideoUrl,
        durationSeconds,
        seedreamPrompt,
      });
      return { frameUrls };
    }

    case 'start_clone_job': {
      const imageUrl = requireString(body, 'imageUrl');
      const referenceVideoUrl = requireString(body, 'referenceVideoUrl');
      const sourceAudioUrl = requireString(body, 'sourceAudioUrl');
      const sourceAudioUploadUrl = requireString(body, 'sourceAudioUploadUrl');
      const sourceAudioPublicUrl = requireString(body, 'sourceAudioPublicUrl');
      const resultUploadUrl = requireString(body, 'resultUploadUrl');
      const resultPublicUrl = requireString(body, 'resultPublicUrl');
      const mergedVideoUploadUrl = requireString(body, 'mergedVideoUploadUrl');
      const mergedVideoPublicUrl = requireString(body, 'mergedVideoPublicUrl');
      const aspectRatio = requireString(body, 'aspectRatio') as '16:9' | '9:16';
      const durationSeconds = requireDuration(body);
      const resolution = requireResolution(body);
      const videoDeploymentKey = parseVideoDeploymentKey(body);
      const prompt = requireString(body, 'prompt');
      const seedreamPrompt = optString(body, 'seedreamPrompt');
      const directVideoGeneration = body.directVideoGeneration === true;
      const generatedFrameUrls = Array.isArray(body.generatedFrameUrls)
        ? body.generatedFrameUrls.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const resultUploadHeaders = (body.resultUploadHeaders && typeof body.resultUploadHeaders === 'object')
        ? body.resultUploadHeaders as Record<string, string>
        : {};
      const sourceAudioUploadHeaders = (body.sourceAudioUploadHeaders && typeof body.sourceAudioUploadHeaders === 'object')
        ? body.sourceAudioUploadHeaders as Record<string, string>
        : {};
      const mergedVideoUploadHeaders = (body.mergedVideoUploadHeaders && typeof body.mergedVideoUploadHeaders === 'object')
        ? body.mergedVideoUploadHeaders as Record<string, string>
        : {};
      const sourceAudioDurationSeconds = Number(body.sourceAudioDurationSeconds);
      const referenceVideoDurationSeconds = Number(body.referenceVideoDurationSeconds);
      const preparedReferenceUploadUrl = optString(body, 'preparedReferenceUploadUrl');
      const preparedReferencePublicUrl = optString(body, 'preparedReferencePublicUrl');
      const preparedReferenceUploadHeaders = (body.preparedReferenceUploadHeaders && typeof body.preparedReferenceUploadHeaders === 'object')
        ? body.preparedReferenceUploadHeaders as Record<string, string>
        : {};

      let effectiveReferenceVideoUrl = referenceVideoUrl;
      if (
        Number.isFinite(referenceVideoDurationSeconds)
        && referenceVideoDurationSeconds > durationSeconds + 0.25
      ) {
        if (!preparedReferenceUploadUrl || !preparedReferencePublicUrl) {
          throw new UserError('Missing prepared reference video upload target for server-side trimming.');
        }
        await trimVideoToUpload({
          sourceVideoUrl: referenceVideoUrl,
          targetDurationSeconds: durationSeconds,
          uploadUrl: preparedReferenceUploadUrl,
          uploadHeaders: preparedReferenceUploadHeaders,
        });
        effectiveReferenceVideoUrl = preparedReferencePublicUrl;
      }

      const extractAudioPromise = extractAudioFromVideoToUpload({
        sourceVideoUrl: effectiveReferenceVideoUrl || sourceAudioUrl,
        uploadUrl: sourceAudioUploadUrl,
        uploadHeaders: sourceAudioUploadHeaders,
      });
      const selectedImageUrlsPromise = directVideoGeneration
        ? Promise.resolve([imageUrl])
        : generatedFrameUrls.length > 0
          ? Promise.resolve(generatedFrameUrls)
          : generateCloneFrameUrls({
            imageUrl,
            referenceVideoUrl: effectiveReferenceVideoUrl,
            durationSeconds,
            seedreamPrompt,
          });

      const [, selectedImageUrls] = await Promise.all([
        extractAudioPromise,
        selectedImageUrlsPromise,
      ]);

      const primaryImageUrl = String(selectedImageUrls[0] || '').trim();
      const additionalImageUrls = selectedImageUrls
        .slice(1)
        .map((item) => String(item || '').trim())
        .filter(Boolean);
      if (!primaryImageUrl) {
        throw new Error('未找到可用于视频生成的参考图片。');
      }

      const jobId = `video_clone_${randomUUID()}`;
      const selectedVideoDeployment = await resolveVideoDeployment(videoDeploymentKey);
      const [videoTask, speechTask] = await Promise.all([
        createCloneVideoTask({
          imageUrl: primaryImageUrl,
          subjectImageUrls: additionalImageUrls,
          referenceVideoUrl: effectiveReferenceVideoUrl,
          aspectRatio,
          durationSeconds,
          resolution,
          prompt,
          videoDeploymentKey,
          externalTaskId: jobId,
        }),
        createCloneSpeechTask({
          sourceAudioUrl: sourceAudioPublicUrl,
          sourceAudioMimeType: 'audio/wav',
          sourceAudioDurationSeconds: Number.isFinite(sourceAudioDurationSeconds) ? sourceAudioDurationSeconds : null,
          voiceSampleUrl: optString(body, 'voiceSampleUrl'),
          voiceSampleMimeType: optString(body, 'voiceSampleMimeType'),
          voiceSampleFileName: optString(body, 'voiceSampleFileName'),
          resultUploadUrl,
          resultPublicUrl,
          resultUploadHeaders,
          voiceId: optString(body, 'voiceId'),
        }),
      ]);

      cloneJobs.set(jobId, {
        jobId,
        videoTaskId: videoTask.taskId,
        speechTaskId: speechTask.taskId,
        videoDeploymentKey: selectedVideoDeployment.deployment_key,
        videoDeploymentName: selectedVideoDeployment.deployment_name,
        audioResultUrl: speechTask.audioUrl,
        mergedVideoUploadUrl,
        mergedVideoUploadHeaders,
        mergedVideoPublicUrl,
        finalVideoUrl: null,
        createdAt: Date.now(),
      });

      return {
        jobId,
        status: 'queued',
        videoTaskId: videoTask.taskId,
        speechTaskId: speechTask.taskId,
        videoDeploymentKey: selectedVideoDeployment.deployment_key,
        videoDeploymentName: selectedVideoDeployment.deployment_name,
      };
    }

    case 'get_clone_job': {
      const jobId = requireString(body, 'jobId');
      const job = cloneJobs.get(jobId);
      if (!job) {
        throw new UserError('Clone job was not found in the BFF cache.', 404);
      }

      const [videoTask, speechTask] = await Promise.all([
        getCloneVideoTask(job.videoTaskId, job.videoDeploymentKey === 'motion_control' ? 'motion_control' : 'omni'),
        getCloneSpeechTask(job.speechTaskId),
      ]);

      const videoStatus = normalizeStatus(videoTask.status);
      const speechStatus = normalizeStatus(speechTask.status);
      const hasStaleVideoTask = isTaskStale(videoTask);
      const hasStaleSpeechTask = isTaskStale(speechTask);
      if (videoStatus === 'failed') {
        return {
          jobId,
          status: 'failed',
          videoTaskId: job.videoTaskId,
          speechTaskId: job.speechTaskId,
          videoDeploymentKey: job.videoDeploymentKey,
          videoDeploymentName: job.videoDeploymentName,
          errorMessage: videoTask.errorMessage || 'Video generation failed.',
        };
      }
      if (hasStaleVideoTask) {
        const errorMessage = buildStaleTaskMessage('video', videoTask);
        return {
          jobId,
          status: 'failed',
          videoTaskId: job.videoTaskId,
          speechTaskId: job.speechTaskId,
          videoDeploymentKey: job.videoDeploymentKey,
          videoDeploymentName: job.videoDeploymentName,
          errorMessage,
        };
      }
      if (speechStatus === 'failed') {
        return {
          jobId,
          status: 'failed',
          videoTaskId: job.videoTaskId,
          speechTaskId: job.speechTaskId,
          videoDeploymentKey: job.videoDeploymentKey,
          videoDeploymentName: job.videoDeploymentName,
          errorMessage: speechTask.errorMessage || 'Speech conversion failed.',
        };
      }
      if (hasStaleSpeechTask) {
        const errorMessage = buildStaleTaskMessage('speech', speechTask);
        return {
          jobId,
          status: 'failed',
          videoTaskId: job.videoTaskId,
          speechTaskId: job.speechTaskId,
          videoDeploymentKey: job.videoDeploymentKey,
          videoDeploymentName: job.videoDeploymentName,
          errorMessage,
        };
      }
      if (videoStatus === 'completed' && speechStatus === 'completed' && videoTask.videoUrl) {
        if (!job.finalVideoUrl) {
          await mergeVideoAndAudioToUpload({
            sourceVideoUrl: videoTask.videoUrl,
            sourceAudioUrl: job.audioResultUrl,
            uploadUrl: job.mergedVideoUploadUrl,
            uploadHeaders: job.mergedVideoUploadHeaders,
          });
          job.finalVideoUrl = job.mergedVideoPublicUrl;
          cloneJobs.set(jobId, job);
        }
        return {
          jobId,
          status: 'completed',
          videoTaskId: job.videoTaskId,
          speechTaskId: job.speechTaskId,
          videoDeploymentKey: job.videoDeploymentKey,
          videoDeploymentName: job.videoDeploymentName,
          videoUrl: job.finalVideoUrl,
          rawVideoUrl: videoTask.videoUrl,
          audioUrl: job.audioResultUrl,
        };
      }

      return {
        jobId,
        status: videoStatus === 'queued' || speechStatus === 'queued' ? 'queued' : 'running',
        videoTaskId: job.videoTaskId,
        speechTaskId: job.speechTaskId,
        videoDeploymentKey: job.videoDeploymentKey,
        videoDeploymentName: job.videoDeploymentName,
        videoStatus,
        speechStatus,
      };
    }

    default:
      throw new UserError(`Unknown action: ${action || '(empty)'}`, 404);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      const payload = await dispatch({ action: 'health' });
      sendJson(res, 200, { success: true, data: payload, message: '' });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/run') {
      const body = await readJsonBody(req);
      const payload = await dispatch(body);
      sendJson(res, 200, { success: true, data: payload, message: '' });
      return;
    }

    sendJson(res, 404, { success: false, data: null, message: `Path not found: ${req.method} ${req.url || ''}` });
  } catch (error) {
    if (error instanceof UserError) {
      sendJson(res, error.status, { success: false, data: null, message: error.message });
      return;
    }
    console.error('[video-clone-bff] request error', error);
    sendJson(res, 500, {
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Unknown BFF error.',
    });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[video-clone-bff] listening on http://127.0.0.1:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`[video-clone-bff] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
