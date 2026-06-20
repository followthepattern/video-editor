import { useState } from "react";
import { Play, Pause, SkipBack, Download } from "lucide-react";
import { useEditor } from "../store";
import { ExportDialog } from "./ExportDialog";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function Transport() {
  const isPlaying = useEditor((s) => s.isPlaying);
  const togglePlay = useEditor((s) => s.togglePlay);
  const currentTime = useEditor((s) => s.currentTime);
  const setTime = useEditor((s) => s.setTime);
  const duration = useEditor((s) => s.project?.duration ?? 0);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t border-border bg-panel px-4 py-2">
      <button onClick={() => setTime(0)} className="text-muted hover:text-white" title="Go to start">
        <SkipBack size={18} />
      </button>
      <button
        onClick={togglePlay}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-white hover:bg-accent"
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="font-mono text-xs tabular-nums text-muted">
        {fmt(currentTime)} <span className="opacity-50">/ {fmt(duration)}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          <Download size={14} /> Export
        </button>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
