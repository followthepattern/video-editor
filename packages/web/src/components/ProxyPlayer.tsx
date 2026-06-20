import { useEffect, useRef } from "react";
import { useEditor } from "../store";

/**
 * Plays the pre-rendered preview proxy (a single mp4 of the whole timeline) for
 * smooth playback. The proxy video is the clock while playing; while paused it
 * follows timeline scrubs. Shown only when the proxy matches the current edit
 * revision (see App); otherwise the live PreviewCanvas is used.
 */
export function ProxyPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const width = useEditor((s) => s.project?.width ?? 16);
  const height = useEditor((s) => s.project?.height ?? 9);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = useEditor.getState();
      if (st.isPlaying) st.setTime(v.currentTime);
    };
    raf = requestAnimationFrame(tick);

    const unsub = useEditor.subscribe((s) => {
      if (s.isPlaying && v.paused) void v.play().catch(() => {});
      if (!s.isPlaying && !v.paused) v.pause();
      // While paused, follow timeline scrubs.
      if (!s.isPlaying && Math.abs(v.currentTime - s.currentTime) > 0.05) {
        v.currentTime = s.currentTime;
      }
    });

    const onEnded = () => useEditor.getState().pause();
    v.addEventListener("ended", onEnded);

    // Initialize to the current playhead/play state.
    const st = useEditor.getState();
    const sync = () => {
      v.currentTime = Math.min(st.currentTime, v.duration || st.currentTime);
      if (st.isPlaying) void v.play().catch(() => {});
    };
    if (v.readyState >= 1) sync();
    else v.addEventListener("loadedmetadata", sync, { once: true });

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      v.removeEventListener("ended", onEnded);
      v.pause();
    };
  }, [url]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={url}
        className="max-h-full max-w-full object-contain"
        style={{ aspectRatio: `${width} / ${height}` }}
        playsInline
      />
    </div>
  );
}
