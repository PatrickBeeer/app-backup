import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'jingke-smoke-'));
const fixtureDir = path.join(tempDir, 'fixtures');
const serverLog = [];
let server;

function exec(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).slice(-2000)}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      const port = typeof address === 'object' && address ? address.port : 33113;
      listener.close(() => resolve(port));
    });
  });
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  throw new Error(`${label} timeout${lastError ? `: ${lastError.message}` : ''}`);
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route} -> ${response.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

async function makeFixtures() {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(fixtureDir, { recursive: true }));
  const video = path.join(fixtureDir, 'reference.mp4');
  exec('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x26374a:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x543148:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x274c3e:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'color=c=0x574b2d:s=360x640:r=15:d=8',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=32',
    '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]',
    '-map', '[v]', '-map', '4:a', '-t', '32', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', video
  ]);
  const images = [];
  for (const [name, color] of [
    ['person-1.jpg', '0xd8a98a'], ['person-2.jpg', '0xc78e72'], ['person-3.jpg', '0xe2b39a'], ['product.jpg', '0xee4e36']
  ]) {
    const output = path.join(fixtureDir, name);
    exec('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=512x512:d=0.1`, '-frames:v', '1', output]);
    images.push(output);
  }
  return { video, people: images.slice(0, 3), product: images[3] };
}

try {
  const fixtures = await makeFixtures();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  server = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DEMO_MODE: 'true',
      DATA_DIR: path.join(tempDir, 'data'),
      NODE_NO_WARNINGS: '1'
    },
    windowsHide: true
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  server.stdout.on('data', (chunk) => serverLog.push(chunk));
  server.stderr.on('data', (chunk) => serverLog.push(chunk));

  await waitFor(async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  }, 20_000, 'server startup');

  const form = new FormData();
  form.set('name', '自动验收 · 便携保温杯');
  form.set('ratio', '9:16');
  form.set('presenterMode', 'reference');
  form.set('productName', '便携保温杯');
  form.set('price', '99 元');
  form.set('sellingPoints', '316 不锈钢\n单手开盖\n长效保温');
  form.set('specifications', '500mL');
  form.set('requiredClaims', '食品接触级材质');
  form.set('forbiddenClaims', '全网最低价');
  form.set('referenceVideo', new File([await readFile(fixtures.video)], 'reference.mp4', { type: 'video/mp4' }));
  for (const [index, filePath] of fixtures.people.entries()) {
    form.append('personPhotos', new File([await readFile(filePath)], `person-${index + 1}.jpg`, { type: 'image/jpeg' }));
  }
  form.append('productImages', new File([await readFile(fixtures.product)], 'product.jpg', { type: 'image/jpeg' }));

  let payload = await request(baseUrl, '/api/projects', { method: 'POST', body: form });
  const projectId = payload.project.id;
  payload = await request(baseUrl, `/api/projects/${projectId}/analyze`, { method: 'POST' });
  if (payload.project.analysis.generationUnits.length < 3) throw new Error('shot grouping did not produce enough demo units');
  await request(baseUrl, `/api/projects/${projectId}/confirm`, { method: 'POST' });
  await request(baseUrl, `/api/projects/${projectId}/generate`, { method: 'POST' });

  payload = await waitFor(async () => {
    const current = await request(baseUrl, `/api/projects/${projectId}`);
    return ['NEEDS_REVIEW', 'READY_TO_RENDER'].includes(current.project.status) ? current : null;
  }, 120_000, 'demo generation');

  const latestByUnit = new Map();
  for (const job of payload.project.jobs) {
    const previous = latestByUnit.get(job.unitId);
    if (!previous || job.attempt > previous.attempt) latestByUnit.set(job.unitId, job);
  }
  for (const job of latestByUnit.values()) {
    if (!job.outputUrl) throw new Error(`missing demo output for ${job.unitId}`);
    await request(baseUrl, `/api/jobs/${job.id}/accept`, { method: 'POST' });
  }

  payload = await request(baseUrl, `/api/projects/${projectId}`);
  if (payload.project.status !== 'READY_TO_RENDER') throw new Error(`project not render ready: ${payload.project.status}`);
  payload = await request(baseUrl, `/api/projects/${projectId}/render`, { method: 'POST' });
  const finalUrl = payload.project.media.finalVideo;
  if (!finalUrl) throw new Error('final video URL missing');
  const finalResponse = await fetch(new URL(finalUrl, baseUrl).href);
  if (!finalResponse.ok || !finalResponse.headers.get('content-type')?.includes('video/mp4')) {
    throw new Error(
      `final video download failed: url=${finalUrl} status=${finalResponse.status} `
      + `content-type=${finalResponse.headers.get('content-type')} body=${(await finalResponse.text()).slice(0, 500)}`
    );
  }
  const finalPath = payload.project.finalVideo;
  const finalStat = await stat(finalPath);
  if (finalStat.size < 1000) throw new Error('final video is unexpectedly small');

  console.log(JSON.stringify({
    ok: true,
    projectId,
    shots: payload.project.analysis.shots.length,
    units: payload.project.analysis.generationUnits.length,
    jobs: payload.project.jobs.length,
    finalBytes: finalStat.size
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (serverLog.length) console.error(serverLog.join('').slice(-6000));
  process.exitCode = 1;
} finally {
  if (server && !server.killed) server.kill();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
}
