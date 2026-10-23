import { useEffect, useRef, useState } from 'react';

function formatTime(seconds: number): string {
  const time = Math.floor(Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
}

export function VideoPreviewPlayer({ url }: { url: string }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function seek(time: number) {
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(videoRef.current.muted);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void playerRef.current?.requestFullscreen();
  }

  return <div className="video-player" ref={playerRef}>
    <video ref={videoRef} src={url} playsInline preload="metadata"
      onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    <div className="video-controls">
      <button type="button" onClick={togglePlayback} aria-label={playing ? '暂停视频' : '播放视频'}>{playing ? '暂停' : '播放'}</button>
      <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)}
        disabled={!duration} aria-label="视频播放进度" onChange={(event) => seek(Number(event.target.value))} />
      <span className="video-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <button type="button" onClick={toggleMute} aria-label={muted ? '取消静音' : '静音'}>{muted ? '取消静音' : '静音'}</button>
      <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '全屏'}>{fullscreen ? '退出全屏' : '全屏'}</button>
    </div>
  </div>;
}
