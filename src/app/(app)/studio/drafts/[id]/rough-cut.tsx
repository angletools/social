"use client";

import { toast } from "@/components/feedback";
import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import type { Beat } from "@/lib/trends/score";
import { cn } from "@/lib/utils";

type Shot = { n: number; type: string; description: string };
export type Media = { url: string; kind: "video" | "image"; name: string; el: HTMLVideoElement | HTMLImageElement };

/** ASCII-only file names; Arabic titles fall back to a dated name. */
export const fileSlug = (title: string) =>
  title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50).toLowerCase() || `rasd-${new Date().toISOString().slice(0, 10)}`;

const W = 540;
const H = 960;

/** One colour per shot, shared by the script badges, the timeline and the preview. */
export const SHOT_COLORS = ["#e8775e", "#3d6aa8", "#2f8f5b", "#d99a2b", "#8a4f86", "#0b8a8a", "#c2255c", "#5f3dc4"];
export const shotColor = (n: number) => SHOT_COLORS[(((n - 1) % SHOT_COLORS.length) + SHOT_COLORS.length) % SHOT_COLORS.length];
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

// ---------- clips: kept in the browser, shared by the shot list and the preview ----------

type Clips = { media: Record<number, Media>; add: (shot: number, file: File) => void; remove: (shot: number) => void };
const ClipsCtx = createContext<Clips | null>(null);

export function ClipsProvider({ children }: { children: React.ReactNode }) {
  const [media, setMedia] = useState<Record<number, Media>>({});
  const ref = useRef(media);
  ref.current = media;
  useEffect(() => () => Object.values(ref.current).forEach((m) => URL.revokeObjectURL(m.url)), []);

  const add = useCallback((shot: number, file: File) => {
    const url = URL.createObjectURL(file);
    const video = file.type.startsWith("video/");
    const el = video ? document.createElement("video") : new Image();
    // Re-render once the file can be drawn, so the preview picks it up.
    const ready = () => setMedia((m) => ({ ...m }));
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.muted = false;
      el.preload = "auto";
      el.loop = true;
      el.onloadeddata = ready;
    } else el.onload = ready;
    el.src = url;
    setMedia((prev) => {
      if (prev[shot]) URL.revokeObjectURL(prev[shot].url);
      return { ...prev, [shot]: { url, kind: video ? "video" : "image", name: file.name, el } };
    });
  }, []);
  const remove = useCallback(
    (shot: number) =>
      setMedia((prev) => {
        const next = { ...prev };
        if (next[shot]) URL.revokeObjectURL(next[shot].url);
        delete next[shot];
        return next;
      }),
    [],
  );
  return <ClipsCtx.Provider value={{ media, add, remove }}>{children}</ClipsCtx.Provider>;
}

export function useClips() {
  const v = useContext(ClipsCtx);
  if (!v) throw new Error("ClipsProvider missing");
  return v;
}

// ---------- drawing ----------

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawTextBlock(ctx: CanvasRenderingContext2D, text: string, y: number, opts: { size: number; weight: number; bg: string; color: string; maxWidth: number; anchor?: "top" | "bottom"; radius?: number }) {
  if (!text.trim()) return;
  ctx.font = `${opts.weight} ${opts.size}px Urbanist, "Plex Arabic", system-ui, sans-serif`;
  ctx.direction = isArabic(text) ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, text, opts.maxWidth).slice(0, 4);
  const lh = opts.size * 1.5;
  const padY = opts.size * 0.55;
  const blockH = lines.length * lh + padY * 2;
  const blockW = opts.maxWidth + 40;
  const top = opts.anchor === "bottom" ? y - blockH : y;
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(W / 2 - blockW / 2, top, blockW, blockH, opts.radius ?? 28);
  ctx.fill();
  ctx.fillStyle = opts.color;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + padY + lh * (i + 0.5)));
}

function drawCover(ctx: CanvasRenderingContext2D, el: HTMLVideoElement | HTMLImageElement) {
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!sw || !sh) return false;
  const scale = Math.max(W / sw, H / sh);
  ctx.drawImage(el, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale);
  return true;
}

/** A colour card for shots without a clip: the shot's colour fading to black under a fine dot grid. */
function drawCard(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  // 62% of the colour at the top, fading to near-black by 78% of the height.
  const shade = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, H);
  shade.addColorStop(0, "rgba(0,0,0,0.38)");
  shade.addColorStop(0.78, "rgba(14,14,14,1)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let y = 10; y < H; y += 20) for (let x = 10; x < W; x += 20) ctx.fillRect(x - 1.8, y - 1.8, 3.6, 3.6);
}

export type RoughCutHandle = { exportVideo: () => void };

export function RoughCut({
  ref,
  beats,
  shots,
  title,
  seek,
  t,
}: {
  ref?: React.Ref<RoughCutHandle>;
  beats: Beat[];
  shots: Shot[];
  title: string;
  /** Beat to show when not playing (follows the line being edited). */
  seek: number;
  t: { rough: string; local: string; play: string; pause: string; subs: string; clipsNote: string; exportVideo: string; exporting: string; shotN: string; unsupported: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { media } = useClips();
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const rafRef = useRef<number>(0);
  const activeBeatRef = useRef(-1);
  const audioRef = useRef<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode; wired: WeakSet<HTMLMediaElement> } | null>(null);
  const total = beats.reduce((a, b) => Math.max(a, b.start + b.duration), 0) || 1;

  const beatAt = useCallback(
    (tm: number) => {
      const i = beats.findIndex((b) => tm >= b.start && tm < b.start + b.duration);
      return i === -1 ? beats.length - 1 : i;
    },
    [beats],
  );

  const draw = useCallback(
    (tm: number, live: boolean) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || beats.length === 0) return;
      const i = beatAt(tm);
      const beat = beats[i];
      const m = mediaRef.current[beat.shot];

      // Keep only the current beat's video running.
      if (i !== activeBeatRef.current) {
        for (const [n, x] of Object.entries(mediaRef.current)) if (x.el instanceof HTMLVideoElement && Number(n) !== beat.shot) x.el.pause();
        if (m?.el instanceof HTMLVideoElement) {
          m.el.currentTime = Math.max(0, tm - beat.start);
          if (live) void m.el.play().catch(() => null);
        }
        activeBeatRef.current = i;
      } else if (m?.el instanceof HTMLVideoElement && !live) m.el.currentTime = Math.max(0, tm - beat.start);

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (!m || !drawCover(ctx, m.el)) drawCard(ctx, shotColor(beat.shot));

      // Shot badge, on-screen text card, then the voice-over as subtitles.
      ctx.font = `600 32px Urbanist, system-ui, sans-serif`;
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const badge = t.shotN.replace("{n}", String(beat.shot));
      const bw = ctx.measureText(badge).width + 42;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect(30, 30, bw, 60, 18);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(badge, 51, 61);

      drawTextBlock(ctx, beat.onScreen, H * 0.27, { size: 42, weight: 700, bg: "rgba(255,255,255,0.94)", color: "#111", maxWidth: W - 112, radius: 30 });
      if (subtitles && beat.vo) drawTextBlock(ctx, beat.vo, H - 42, { size: 30, weight: 500, bg: "rgba(0,0,0,0.6)", color: "#fff", maxWidth: W - 100, anchor: "bottom", radius: 20 });
    },
    [beats, beatAt, subtitles, t.shotN],
  );

  useEffect(() => {
    void document.fonts?.load(`700 40px "Plex Arabic"`).then(() => draw(timeRef.current, false));
  }, [draw]);

  useEffect(() => {
    if (!playing) draw(time, false);
  }, [time, playing, draw, media]);

  // Follow the line being edited while paused.
  useEffect(() => {
    if (playing || !beats[seek]) return;
    const b = beats[seek];
    const tm = b.start + Math.min(b.duration * 0.45, b.duration - 0.05);
    timeRef.current = tm;
    activeBeatRef.current = -1;
    setTime(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek]);

  const stopLoop = () => {
    cancelAnimationFrame(rafRef.current);
    for (const x of Object.values(mediaRef.current)) if (x.el instanceof HTMLVideoElement) x.el.pause();
  };

  const play = (from: number, onEnd?: () => void) => {
    const startedAt = performance.now() - from * 1000;
    activeBeatRef.current = -1;
    const tick = () => {
      const tm = (performance.now() - startedAt) / 1000;
      if (tm >= total) {
        stopLoop();
        timeRef.current = 0;
        setTime(0);
        setPlaying(false);
        onEnd?.();
        return;
      }
      timeRef.current = tm;
      draw(tm, true);
      setTime(tm);
      rafRef.current = requestAnimationFrame(tick);
    };
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const toggle = () => {
    if (playing) {
      stopLoop();
      setPlaying(false);
    } else play(time >= total - 0.05 ? 0 : time);
  };

  const wireAudio = (el: HTMLVideoElement) => {
    audioRef.current ??= (() => {
      const ctx = new AudioContext();
      return { ctx, dest: ctx.createMediaStreamDestination(), wired: new WeakSet() };
    })();
    const a = audioRef.current;
    if (a.wired.has(el)) return;
    const src = a.ctx.createMediaElementSource(el);
    src.connect(a.dest);
    src.connect(a.ctx.destination);
    a.wired.add(el);
  };

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (exporting) return;
    if (!canvas || typeof MediaRecorder === "undefined" || !canvas.captureStream) return toast(t.unsupported, "error");
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return toast(t.unsupported, "error");
    stopLoop();
    const stream = canvas.captureStream(30);
    const videos = Object.values(mediaRef.current)
      .map((m) => m.el)
      .filter((el): el is HTMLVideoElement => el instanceof HTMLVideoElement);
    if (videos.length) {
      videos.forEach(wireAudio);
      await audioRef.current?.ctx.resume();
      audioRef.current?.dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileSlug(title)}-rough-cut.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setExporting(false);
    };
    setExporting(true);
    toast(t.exporting, "info", { busy: true });
    rec.start(250);
    play(0, () => setTimeout(() => rec.stop(), 150));
  };
  useImperativeHandle(ref, () => ({ exportVideo }));

  const current = beatAt(time);
  const usedShots = [...new Set(beats.map((b) => b.shot))];
  const withClip = usedShots.filter((n) => media[n]).length;
  const ticks = [0, 1, 2, 3].map((k) => Math.round((total * k) / 3));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[16px] font-semibold">{t.rough}</span>
        <span className="text-[12.5px] text-faint">{t.local}</span>
      </div>
      <div className="flex gap-5">
        <canvas ref={canvasRef} width={W} height={H} className="h-[288px] w-[162px] shrink-0 rounded-[16px] bg-black" aria-label={t.rough} role="img" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span dir="ltr" className="text-start text-[22px] font-semibold tracking-[-0.01em] tnum rtl:text-end">
            {time.toFixed(1)}s<span className="text-[14px] font-normal text-faint"> / {total.toFixed(1)}s</span>
          </span>
          <button type="button" className="btn-primary h-10 w-full text-[14px] font-semibold" onClick={toggle} disabled={exporting}>
            {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
            {playing ? t.pause : t.play}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={subtitles}
            onClick={() => setSubtitles((v) => !v)}
            className="flex items-center gap-2.5 text-start text-[13.5px] leading-[1.4]"
          >
            <span aria-hidden className={cn("relative h-5 w-[34px] shrink-0 rounded-full transition-colors duration-150", subtitles ? "bg-ink" : "bg-line-strong")}>
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-[inset-inline-start] duration-150 ease-(--ease-out)", subtitles ? "start-4" : "start-0.5")} />
            </span>
            {t.subs}
          </button>
          <span className="mt-auto text-[13px] leading-normal text-faint">{t.clipsNote.replace("{n}", String(withClip)).replace("{total}", String(usedShots.length))}</span>
          <button type="button" className="btn-secondary h-[38px] w-full rounded-[11px] px-2 text-[13.5px]" onClick={exportVideo} disabled={exporting || playing}>
            {exporting && <Loader2 className="h-4 w-4 animate-spin" />}
            {exporting ? t.exporting : t.exportVideo}
          </button>
        </div>
      </div>
      <div dir="ltr" className="flex flex-col gap-1.5">
        <div className="relative flex h-11 gap-[3px]">
          {beats.map((b, i) => {
            const c = shotColor(b.shot);
            return (
              <button
                type="button"
                key={i}
                title={b.onScreen || b.vo}
                aria-label={`${t.shotN.replace("{n}", String(b.shot))} · ${b.start.toFixed(1)}s`}
                onClick={() => {
                  if (playing) return;
                  timeRef.current = b.start + 0.01;
                  activeBeatRef.current = -1;
                  setTime(b.start + 0.01);
                }}
                className="relative flex h-11 min-w-0 items-end rounded-lg pb-1.5 ps-[7px] text-start text-[11.5px] font-semibold"
                style={{
                  flex: `${b.duration} 1 0`,
                  color: c,
                  background: `color-mix(in srgb, ${c} ${i === current ? 34 : 18}%, transparent)`,
                  boxShadow: i === current ? "inset 0 0 0 1.5px currentColor" : undefined,
                }}
              >
                {b.shot}
                {media[b.shot] && <span aria-hidden className="absolute top-1.5 right-1.5 h-[5px] w-[5px] rounded-full bg-current" />}
              </button>
            );
          })}
          <span aria-hidden className="pointer-events-none absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-[1px] bg-ink" style={{ left: `${Math.min(100, (time / total) * 100).toFixed(2)}%` }} />
        </div>
        <div className="flex justify-between text-[11.5px] text-faint tnum">
          {ticks.map((s, i) => (
            <span key={i}>{s}s</span>
          ))}
        </div>
      </div>
    </div>
  );
}
