import { useEffect, useState } from "react";
import { FolderOpen, SlidersHorizontal, Play, Pause, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor } from "./store";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { ProjectPanel } from "./components/ProjectPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Transport } from "./components/Transport";

type Tab = "project" | "properties";

export function App() {
  const init = useEditor((s) => s.init);
  const project = useEditor((s) => s.project);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const isPlaying = useEditor((s) => s.isPlaying);
  const togglePlay = useEditor((s) => s.togglePlay);
  const [tab, setTab] = useState<Tab>("project");

  useEffect(() => {
    init().catch((e) => console.error("init failed", e));
  }, [init]);

  // Auto-focus the Properties tab when a clip is selected.
  useEffect(() => {
    if (selectedClipId) setTab("properties");
  }, [selectedClipId]);

  return (
    <div className="flex h-screen flex-col bg-[#0b0d11] text-[#e6e8ee]">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-semibold text-white">Video Editor</span>
          {project && <span className="opacity-60">/ {project.name}</span>}
        </div>
        <div className="text-xs text-muted">
          {project ? `${project.width}×${project.height} · ${project.fps}fps` : "loading…"}
        </div>
      </header>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        {/* Center: preview */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="group relative min-h-0 flex-1 overflow-hidden bg-black p-4">
            <PreviewCanvas />
            {/* Center play/pause overlay */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-opacity ${
                  isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-90"
                }`}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
              </span>
            </button>
          </div>
          <Transport />
        </main>

        {/* Right: tabbed panel */}
        <aside className="flex w-80 flex-col border-l border-border bg-panel">
          <div className="flex border-b border-border">
            <TabButton active={tab === "project"} onClick={() => setTab("project")} icon={<FolderOpen size={14} />}>
              Project
            </TabButton>
            <TabButton active={tab === "properties"} onClick={() => setTab("properties")} icon={<SlidersHorizontal size={14} />}>
              Properties
            </TabButton>
          </div>
          <div className="min-h-0 flex-1">
            {tab === "project" ? <ProjectPanel /> : <PropertiesPanel />}
          </div>
        </aside>
      </div>

      {/* Bottom: timeline */}
      <div className="flex h-64 flex-col border-t border-border bg-[#12141a]">
        <TimelineToolbar />
        <div className="min-h-0 flex-1">
          <Timeline />
        </div>
      </div>
    </div>
  );
}

function TimelineToolbar() {
  const zoomIn = useEditor((s) => s.zoomIn);
  const zoomOut = useEditor((s) => s.zoomOut);
  const scaleWidth = useEditor((s) => s.timelineScaleWidth);
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
      <span className="text-xs font-medium text-muted">Timeline</span>
      <div className="flex items-center gap-1 text-muted">
        <button onClick={zoomOut} className="rounded p-1 hover:bg-elevated hover:text-white" title="Zoom out">
          <ZoomOut size={15} />
        </button>
        <span className="w-12 text-center text-[11px] tabular-nums">{scaleWidth} px/s</span>
        <button onClick={zoomIn} className="rounded p-1 hover:bg-elevated hover:text-white" title="Zoom in">
          <ZoomIn size={15} />
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium ${
        active ? "border-b-2 border-accent text-white" : "text-muted hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
