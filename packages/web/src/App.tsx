import { useEffect, useState } from "react";
import { FolderOpen, SlidersHorizontal } from "lucide-react";
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
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 bg-black p-4">
            <PreviewCanvas />
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
      <div className="h-64 border-t border-border bg-[#12141a]">
        <Timeline />
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
