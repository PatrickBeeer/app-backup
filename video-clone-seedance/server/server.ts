import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { config } from './config';
import {
  CPRT_MULTIMODAL_VIDEO_MODELS,
  CPRT_RATIOS,
  CPRT_RESOLUTIONS_BY_MODEL,
  createMultimodalVideoTask,
  getMultimodalVideoTask,
} from './cprt';
import { buildConversionSlots } from '../shared/cprtContract';
import { calculateVideoPointCost } from '../shared/pricing';
import { inspectVideo } from './media';
import {
  RequestValidationError,
  parseStartCloneInput,
  requireHttpsUrl,
  requireString,
  type RunBody,
} from './validation';

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
      throw new RequestValidationError('Request body is too large.', 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestValidationError('Request body must be valid JSON.', 400);
  }
}

async function dispatch(body: RunBody): Promise<unknown> {
  const action = String(body.action || '').trim();

  switch (action) {
    case 'health': {
      return {
        status: 'ok',
        service: 'video-clone-seedance-bff',
        hasCprtKey: Boolean(config.cprtApiKey),
        models: CPRT_MULTIMODAL_VIDEO_MODELS,
        resolutionsByModel: CPRT_RESOLUTIONS_BY_MODEL,
        ratios: CPRT_RATIOS,
      };
    }

    case 'inspect_reference_video': {
      const sourceUrl = requireHttpsUrl(body, 'sourceUrl');
      const inspection = await inspectVideo(sourceUrl);
      return inspection;
    }

    case 'inspect_reference_audio': {
      const sourceUrl = requireHttpsUrl(body, 'sourceUrl');
      // ffprobe reads audio files via the format section (durationSeconds); the
      // video-specific fields simply come back null.
      const inspection = await inspectVideo(sourceUrl);
      return inspection;
    }

    case 'quote_clone_job': {
      try {
        const model = requireString(body, 'model');
        const resolution = requireString(body, 'resolution');
        const durationSeconds = Number(body.durationSeconds);
        return {
          model,
          resolution,
          durationSeconds,
          pointCost: calculateVideoPointCost(model, resolution, durationSeconds),
        };
      } catch (error) {
        throw new RequestValidationError(error instanceof Error ? error.message : 'Invalid pricing parameters.', 400);
      }
    }

    case 'start_clone_job': {
      const input = parseStartCloneInput(body);
      const pointCost = calculateVideoPointCost(input.model, input.resolution, input.durationSeconds);

      const task = await createMultimodalVideoTask({
        model: input.model,
        prompt: input.prompt,
        resolution: input.resolution,
        durationSeconds: input.durationSeconds,
        ratio: input.ratio,
        imageUrls: input.imageUrls,
        videoUrls: [input.referenceVideoUrl],
        audioUrls: input.audioUrls,
        realPersonMode: input.realPersonMode,
        conversionSlots: input.realPersonMode ? buildConversionSlots(input.imageUrls.length, 1) : undefined,
      });

      return {
        jobId: task.taskId,
        taskId: task.taskId,
        status: task.status,
        model: input.model,
        pointCost,
      };
    }

    case 'get_clone_job': {
      const taskId = requireString(body, 'jobId');
      const task = await getMultimodalVideoTask(taskId);
      return {
        jobId: task.taskId,
        taskId: task.taskId,
        status: task.status,
        videoUrl: task.videoUrl,
        errorMessage: task.errorMessage,
      };
    }

    default:
      throw new RequestValidationError(`Unknown action: ${action || '(empty)'}`, 404);
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
    if (error instanceof RequestValidationError) {
      sendJson(res, error.status, { success: false, data: null, message: error.message });
      return;
    }
    console.error('[video-clone-seedance-bff] request error', error);
    sendJson(res, 500, {
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Unknown BFF error.',
    });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[video-clone-seedance-bff] listening on http://127.0.0.1:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`[video-clone-seedance-bff] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
