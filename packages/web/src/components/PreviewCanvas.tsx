import { useEffect, useRef } from "react";
import type { Clip, Effect, Project } from "@ve/core";
import { useEditor } from "../store";
import { mediaUrl } from "../api";

/**
 * Real-time composited preview using a 2D canvas. Each visual clip's source is
 * drawn at the playhead time with its transform; effects map to `ctx.filter`.
 * A single rAF loop both advances the clock (when playing) and renders.
 */
export function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useEditor((s) => s.project?.width ?? 16);
  const height = useEditor((s) => s.project?.height ?? 9);
  // Media elements keyed by clip id, kept across frames.
  const mediaRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const getMedia = (clip: Clip, project: Project) => {
      const asset = project.assets.find((a) => a.id === clip.assetId);
      if (!asset) return null;
      let el = mediaRef.current.get(clip.id);
      if (!el) {
        if (asset.type === "image") {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = mediaUrl(asset.id);
          el = img;
        } else {
          const v = document.createElement("video");
          v.crossOrigin = "anonymous";
          v.src = mediaUrl(asset.id);
          v.muted = true; // preview audio is intentionally muted for stability
          v.preload = "auto";
          el = v;
        }
        mediaRef.current.set(clip.id, el);
      }
      return el;
    };

    const filterFor = (effects: Effect[]): string => {
      const parts: string[] = [];
      for (const fx of effects) {
        switch (fx.type) {
          case "blur": if (fx.value > 0) parts.push(`blur(${fx.value}px)`); break;
          case "brightness": parts.push(`brightness(${1 + fx.value})`); break;
          case "contrast": parts.push(`contrast(${fx.value || 1})`); break;
          case "saturation": parts.push(`saturate(${fx.value || 1})`); break;
          case "grayscale": parts.push(`grayscale(1)`); break;
        }
      }
      return parts.join(" ") || "none";
    };

    const drawClip = (clip: Clip, project: Project, time: number, playing: boolean) => {
      const local = clip.inPoint + (time - clip.start);

      if (clip.text && !clip.assetId) {
        const t = clip.text;
        ctx.save();
        ctx.filter = "none";
        ctx.globalAlpha = clip.transform.opacity;
        ctx.fillStyle = t.color;
        ctx.font = `bold ${t.fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          t.content,
          project.width / 2 + clip.transform.x,
          project.height / 2 + clip.transform.y,
        );
        ctx.restore();
        return;
      }

      const el = getMedia(clip, project);
      if (!el) return;

      if (el instanceof HTMLVideoElement) {
        if (playing) {
          if (el.paused) void el.play().catch(() => {});
          if (Math.abs(el.currentTime - local) > 0.3) el.currentTime = local;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - local) > 0.05) el.currentTime = local;
        }
        if (el.readyState < 2) return;
      } else if (!el.complete) {
        return;
      }

      const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
      const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
      if (!w || !h) return;

      const tf = clip.transform;
      ctx.save();
      ctx.globalAlpha = tf.opacity;
      ctx.filter = filterFor(clip.effects);
      ctx.translate(project.width / 2 + tf.x, project.height / 2 + tf.y);
      ctx.rotate((tf.rotation * Math.PI) / 180);
      ctx.scale(tf.scale, tf.scale);
      // Contain the source within the canvas while preserving aspect.
      const fit = Math.min(project.width / w, project.height / h);
      const dw = w * fit;
      const dh = h * fit;
      ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };

    const render = () => {
      const { project } = useEditor.getState();
      raf = requestAnimationFrame(render);
      if (!project) return;

      // Resize backing store if needed.
      if (canvas.width !== project.width || canvas.height !== project.height) {
        canvas.width = project.width;
        canvas.height = project.height;
      }

      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      const state = useEditor.getState();
      let time = state.currentTime;
      if (state.isPlaying) {
        time += dt;
        if (time >= project.duration && project.duration > 0) {
          time = project.duration;
          useEditor.getState().pause();
        }
        useEditor.getState().setTime(time);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const visualTracks = project.tracks.filter(
        (t) => t.type === "video" || t.type === "overlay" || t.type === "text",
      );
      for (const track of visualTracks) {
        for (const clip of track.clips) {
          if (time >= clip.start && time < clip.start + clip.duration) {
            drawClip(clip, project, time, state.isPlaying);
          }
        }
      }
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      for (const el of mediaRef.current.values()) {
        if (el instanceof HTMLVideoElement) el.pause();
      }
    };
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full object-contain"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
    </div>
  );
}
