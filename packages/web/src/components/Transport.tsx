import { useState } from "react";
import { Play, Pause, SkipBack, Download } from "lucide-react";
import { useEditor } from "../store";
import { exportVideo } from "../api";

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
  const projectName = useEditor((s) => s.project?.name ?? "");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const runExport = async () => {
    setExporting(true);
    setProgress(0);
    setResult(null);
    setError(null);
    const exportName = name.trim() || projectName || "export";
    try {
      await exportVideo(exportName, (e) => {
        if (e.type === "progress") setProgress((e.data as { percent: number }).percent);
        if (e.type === "done") setResult(e.data as { url: string; file: string });
        if (e.type === "error") setError((e.data as { error: string }).error);
      });
    } finally {
      setExporting(false);
    }
  };

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
        {exporting && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-elevated">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            {Math.round(progress)}%
          </div>
        )}
        {error && !exporting && <span className="text-xs text-red-400">{error}</span>}
        {result && !exporting && (
          <a
            href={result.url}
            download={result.file}
            target="_blank"
            className="text-xs text-accent underline"
            rel="noreferrer"
          >
            Download {result.file}
          </a>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={projectName || "export"}
          className="w-32 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs text-white placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          title="Export file name"
        />
        <button
          onClick={runExport}
          disabled={exporting}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <Download size={14} /> Export
        </button>
      </div>
    </div>
  );
}
