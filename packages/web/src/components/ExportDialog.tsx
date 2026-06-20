import { useEffect, useState } from "react";
import { X, Download, FolderOpen } from "lucide-react";
import { useEditor } from "../store";
import { exportVideo, saveExport } from "../api";

type Phase = "form" | "rendering" | "saving" | "done" | "error";

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projectName = useEditor((s) => s.project?.name ?? "");
  const width = useEditor((s) => s.project?.width ?? 0);
  const height = useEditor((s) => s.project?.height ?? 0);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setName(projectName || "export");
      setPhase("form");
      setProgress(0);
      setMessage("");
    }
  }, [open, projectName]);

  if (!open) return null;

  const run = async () => {
    const exportName = name.trim() || projectName || "export";
    setPhase("rendering");
    setProgress(0);
    let url: string | null = null;
    let file = `${exportName}.mp4`;
    try {
      await exportVideo(exportName, (e) => {
        if (e.type === "progress") setProgress((e.data as { percent: number }).percent);
        if (e.type === "done") {
          const d = e.data as { url: string; file: string };
          url = d.url;
          file = d.file;
        }
        if (e.type === "error") throw new Error((e.data as { error: string }).error);
      });
      if (!url) throw new Error("render produced no file");
      setPhase("saving");
      const result = await saveExport(url, file);
      setMessage(result === "saved" ? "Saved to the folder you chose." : `Downloaded ${file}.`);
      setPhase("done");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        // User cancelled the save dialog after a successful render.
        setMessage("Render complete — save cancelled. It's also in the project's exports folder.");
        setPhase("done");
        return;
      }
      setMessage(String((err as Error)?.message ?? err));
      setPhase("error");
    }
  };

  const busy = phase === "rendering" || phase === "saving";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={busy ? undefined : onClose}>
      <div
        className="w-96 rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Export video</h2>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-white disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted">File name</label>
        <div className="mb-4 flex items-center rounded-md border border-border bg-elevated">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
            placeholder="export"
          />
          <span className="px-2 text-xs text-muted">.mp4</span>
        </div>

        <div className="mb-4 text-xs text-muted">
          Output: {width}×{height}. You'll choose the destination folder after rendering.
        </div>

        {busy && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{phase === "rendering" ? "Rendering…" : "Saving…"}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${phase === "saving" ? 100 : progress}%` }} />
            </div>
          </div>
        )}

        {phase === "done" && <div className="mb-4 text-xs text-green-400">{message}</div>}
        {phase === "error" && <div className="mb-4 text-xs text-red-400">{message}</div>}

        <div className="flex justify-end gap-2">
          {phase === "done" ? (
            <button onClick={onClose} className="rounded-md bg-elevated px-3 py-1.5 text-xs font-medium text-white">
              Close
            </button>
          ) : (
            <button
              onClick={run}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {phase === "saving" ? <FolderOpen size={14} /> : <Download size={14} />}
              {busy ? "Working…" : "Export"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
