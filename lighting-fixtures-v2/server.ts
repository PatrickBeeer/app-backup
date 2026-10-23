import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import axios from "axios";
import os from "os";

// Set ffmpeg path
if (ffmpegPath) {
  const actualPath = typeof ffmpegPath === 'string' ? ffmpegPath : (ffmpegPath as any).default;
  if (actualPath) {
    console.log('Setting FFmpeg path to:', actualPath);
    ffmpeg.setFfmpegPath(actualPath);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API to truncate video to 4 seconds
  app.post("/api/video/truncate", async (req, res) => {
    const { videoUrl, apiKey: bodyApiKey } = req.body;
    const apiKey = bodyApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;

    if (!videoUrl) {
      return res.status(400).json({ error: "Missing videoUrl" });
    }

    if (!videoUrl.startsWith('http')) {
      return res.status(400).json({ error: "Invalid videoUrl format. Must be an HTTP(S) URL." });
    }

    const tempInput = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
    const tempOutput = path.join(os.tmpdir(), `output-${Date.now()}.mp4`);

    try {
      console.log(`Processing truncation for: ${videoUrl}`);
      
      const downloadVideo = async (url: string, key: string | undefined) => {
        const headers: Record<string, string> = {};
        if (key && key.trim()) {
          headers['x-goog-api-key'] = key.trim();
          console.log(`Using API key header (length: ${key.trim().length}, first 4: ${key.trim().slice(0, 4)}...)`);
        } else {
          console.log('No API key provided for download');
        }

        try {
          console.log(`Attempting download with axios...`);
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: headers,
            timeout: 90000,
            maxRedirects: 5,
          });
          return response;
        } catch (error: any) {
          const status = error.response?.status;
          console.log(`Download failed with status: ${status}`);
          
          if (status && [400, 401, 403].includes(status) && Object.keys(headers).length > 0) {
            console.log(`Retrying without header...`);
            return await axios({
              method: 'get',
              url: url,
              responseType: 'stream',
              timeout: 90000,
              maxRedirects: 5,
            });
          }
          throw error;
        }
      };

      const response = await downloadVideo(videoUrl, apiKey);
      console.log(`Download successful, status: ${response.status}`);

      const writer = fs.createWriteStream(tempInput);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', (err) => {
          console.error('Writer error:', err);
          reject(err);
        });
        response.data.on('error', (err: any) => {
          console.error('Response stream error:', err);
          reject(err);
        });
      });

      const stats = fs.statSync(tempInput);
      console.log(`Video downloaded successfully. Size: ${stats.size} bytes`);

      if (stats.size === 0) {
        throw new Error('Downloaded video is empty');
      }

      console.log('Starting FFmpeg truncation...');

      // Truncate using ffmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempInput)
          .setDuration(4)
          .output(tempOutput)
          .on('start', (commandLine) => {
            console.log('Spawned FFmpeg with command: ' + commandLine);
          })
          .on('end', () => {
            console.log('FFmpeg truncation finished');
            resolve();
          })
          .on('error', (err, stdout, stderr) => {
            console.error('FFmpeg error:', err.message);
            console.error('FFmpeg stderr:', stderr);
            reject(new Error(`FFmpeg failed: ${err.message}`));
          })
          .run();
      });

      if (!fs.existsSync(tempOutput)) {
        throw new Error('FFmpeg output file not found');
      }

      // Send truncated video back
      const videoBuffer = fs.readFileSync(tempOutput);
      res.set('Content-Type', 'video/mp4');
      res.send(videoBuffer);
      console.log('Truncated video sent to client');

    } catch (error: any) {
      console.error('Truncation process failed:', error.message);
      
      let status = 500;
      let details = error.message;

      if (error.response) {
        status = error.response.status;
        console.error('Axios error response status:', status);
        // Try to get more info from the response body if it's not a stream
        if (error.response.data && typeof error.response.data !== 'object') {
           console.error('Axios error response data:', error.response.data);
        }
      }

      res.status(status).json({ 
        error: "Failed to truncate video", 
        details: details,
        status: status
      });
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
