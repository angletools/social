"use client";

import { toast } from "@/components/feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Pause, Play, X } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import type { Beat } from "@/lib/trends/score";
import { cn } from "@/lib/utils";

type Shot = { n: number; type: string; description: string };
type Media = { url: string; kind: "video" | "image"; name: string; el: HTMLVideoElement | HTMLImageElement };

/** ASCII-only file names; Arabic titles fall back to a dated name. */
export const fileSlug = (title: string) =>
  title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50).toLowerCase() || `rasd-${new Date().toISOString().slice(0, 10)}`;

const W = 540;
const H = 960;
const SHOT_COLORS = ["#0b8a6b", "#0e7490", "#7c3aed", "#b45309", "#be123c", "#2563eb", "#4d7c0f", "#db2777"];
const isArabic = (s: string) => /[؀-ۿ]/.test(s);

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

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  opts: { size: number; weight: number; bg: string; color: string; maxWidth: number },
) {
  if (!text.trim()) return;
  ctx.font = `${opts.weight} ${opts.size}px Urbanist, "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.direction = isArabic(text) ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, text, opts.maxWidth);
  const lh = opts.size * 1.35;
  const blockH = lines.length * lh + opts.size * 0.6;
  const blockW = Math.min(opts.maxWidth + 40, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 40);
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(W / 2 - blockW / 2, y - blockH / 2, blockW, blockH, 18);
  ctx.fill();
  ctx.fillStyle = opts.color;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y - blockH / 2 + opts.size * 0.3 + lh * (i + 0.5)));
}

function drawCover(ctx: CanvasRenderingContext2D, el: HTMLVideoElement | HTMLImageElement) {
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export function RoughCut({ beats, shots, title, t }: { beats: Beat[]; shots: Shot[]; title: string; t: Dict["studio"]["rough"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [media, setMedia] = useState<Record<number, Media>>({});
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

  const beatAt = useCallback((tm: number) => {
    const i = beats.findIndex((b) => tm >= b.start && tm < b.start + b.duration);
    return i === -1 ? beats.length - 1 : i;
  }, [beats]);

  const draw = useCallback(
    (tm: number, live: boolean) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || beats.length === 0) return;
      const i = beatAt(tm);
      const beat = beats[i];
      const m = mediaRef.current[beat.shot];

      // Keep only the current beat's video running.
      if (i !== activeBeatRef.current) {
        for (const [n, x] of Object.entries(mediaRef.current)) {
          if (x.el instanceof HTMLVideoElement && Number(n) !== beat.shot) x.el.pause();
        }
        if (m?.el instanceof HTMLVideoElement) {
          m.el.currentTime = Math.max(0, tm - beat.start);
          if (live) void m.el.play().catch(() => null);
        }
        activeBeatRef.current = i;
      } else if (m?.el instanceof HTMLVideoElement && !live) {
        m.el.currentTime = Math.max(0, tm - beat.start);
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (m) drawCover(ctx, m.el);
      else {
        const shot = shots.find((s) => s.n === beat.shot);
        const color = SHOT_COLORS[(beat.shot - 1 + SHOT_COLORS.length) % SHOT_COLORS.length];
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, color);
        g.addColorStop(1, "#0f1a17");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.font = `600 22px Urbanist, "IBM Plex Sans Arabic", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.direction = "ltr";
        ctx.fillText(`SHOT ${beat.shot}${shot ? ` · ${shot.type.replace(/_/g, " ")}` : ""}`, W / 2, H * 0.5 - 70);
        drawTextBlock(ctx, beat.visual || shot?.description || "", H * 0.5 + 10, { size: 22, weight: 400, bg: "rgba(0,0,0,0)", color: "rgba(255,255,255,.8)", maxWidth: W - 100 });
      }

      drawTextBlock(ctx, beat.onScreen, H * 0.24, { size: 40, weight: 700, bg: "rgba(255,255,255,.95)", color: "#0f1a17", maxWidth: W - 90 });
      if (subtitles && beat.vo) drawTextBlock(ctx, beat.vo, H * 0.8, { size: 26, weight: 500, bg: "rgba(0,0,0,.6)", color: "#fff", maxWidth: W - 80 });

      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(0, 0, W, 6);
      ctx.fillStyle = "#13a37f";
      ctx.fillRect(0, 0, (tm / total) * W, 6);
    },
    [beats, shots, beatAt, subtitles, total],
  );

  useEffect(() => {
    void document.fonts?.load(`700 40px "IBM Plex Sans Arabic"`).then(() => draw(timeRef.current, false));
  }, [draw]);

  useEffect(() => {
    if (!playing) draw(time, false);
  }, [time, playing, draw, media]);

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

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    for (const x of Object.values(mediaRef.current)) URL.revokeObjectURL(x.url);
  }, []);

  const toggle = () => {
    if (playing) {
      stopLoop();
      setPlaying(false);
    } else play(time >= total ? 0 : time);
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

  const addMedia = (shotN: number, file: File) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    const el = isVideo ? document.createElement("video") : new Image();
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.preload = "auto";
      el.loop = true;
      el.onloadeddata = () => draw(timeRef.current, false);
    } else el.onload = () => draw(timeRef.current, false);
    el.src = url;
    setMedia((prev) => {
      if (prev[shotN]) URL.revokeObjectURL(prev[shotN].url);
      return { ...prev, [shotN]: { url, kind: isVideo ? "video" : "image", name: file.name, el } };
    });
  };

  const removeMedia = (shotN: number) =>
    setMedia((prev) => {
      const next = { ...prev };
      if (next[shotN]) URL.revokeObjectURL(next[shotN].url);
      delete next[shotN];
      return next;
    });

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined" || !canvas.captureStream) return toast(t.unsupported, "error");
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return toast(t.unsupported, "error");
    stopLoop();
    const stream = canvas.captureStream(30);
    const videos = Object.values(mediaRef.current).map((m) => m.el).filter((el): el is HTMLVideoElement => el instanceof HTMLVideoElement);
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
    rec.start(250);
    play(0, () => setTimeout(() => rec.stop(), 150));
  };

  const current = beatAt(time);
  const usedShots = [...new Set(beats.map((b) => b.shot))];

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div>
        <canvas ref={canvasRef} width={W} height={H} className="w-full max-w-[18rem] rounded-xl bg-black shadow-lg" />
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn-primary" onClick={toggle} disabled={exporting}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? t.pause : t.play}
          </button>
          <span className="text-sm text-muted ltr-nums">
            {time.toFixed(1)}s / {total.toFixed(1)}s
          </span>
        </div>
        <button type="button" className="btn-secondary mt-2 w-full" onClick={exportVideo} disabled={exporting || playing}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {exporting ? t.exporting : t.export}
        </button>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} className="accent-brand-600" /> {t.subtitles}
        </label>
      </div>

      <div className="min-w-0 space-y-5">
        <p className="text-sm text-muted">{t.hint}</p>
        <div dir="ltr" className="flex h-14 overflow-hidden rounded-xl border border-line">
          {beats.map((b, i) => (
            <button
              type="button"
              key={i}
              title={b.onScreen || b.vo}
              onClick={() => {
                if (playing) return;
                timeRef.current = b.start;
                activeBeatRef.current = -1;
                setTime(b.start + 0.01);
              }}
              className={cn("relative min-w-0 border-e border-white/40 px-1 text-start text-[10px] leading-tight text-white", i === current && "ring-2 ring-inset ring-sand-500")}
              style={{ width: `${(b.duration / total) * 100}%`, background: SHOT_COLORS[(b.shot - 1 + SHOT_COLORS.length) % SHOT_COLORS.length] }}
            >
              <span className="block font-semibold">{b.shot}</span>
              <span className="line-clamp-2 opacity-80" dir="auto">{b.onScreen}</span>
              {media[b.shot] && <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />}
            </button>
          ))}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {usedShots.map((n) => {
            const shot = shots.find((s) => s.n === n);
            const m = media[n];
            return (
              <li key={n} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: SHOT_COLORS[(n - 1 + SHOT_COLORS.length) % SHOT_COLORS.length] }}>
                  {n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{shot?.type.replace(/_/g, " ") ?? `Shot ${n}`}</p>
                  <p className="truncate text-xs text-muted">{m ? m.name : shot?.description}</p>
                </div>
                {m ? (
                  <button type="button" className="btn-ghost btn-sm w-7 px-0" onClick={() => removeMedia(n)} aria-label={t.remove}>
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <label className="btn-secondary btn-sm cursor-pointer">
                    <ImagePlus className="h-3.5 w-3.5" /> {t.add}
                    <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && addMedia(n, e.target.files[0])} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
