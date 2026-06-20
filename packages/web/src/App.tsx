import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  SlidersHorizontal,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Scissors,
  ChevronDown,
  Check,
} from "lucide-react";
import { useEditor } from "./store";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ProxyPlayer } from "./components/ProxyPlayer";
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
  const setTool = useEditor((s) => s.setTool);
  const proxy = useEditor((s) => s.proxy);
  const revision = useEditor((s) => s.revision);
  const proxyRendering = useEditor((s) => s.proxyRendering);
  const [tab, setTab] = useState<Tab>("project");

  // Use the pre-rendered proxy only when it matches the current edit revision.
  const useProxy = !!proxy && proxy.rev === revision;

  useEffect(() => {
    init().catch((e) => console.error("init failed", e));
  }, [init]);

  useEffect(() => {
    if (selectedClipId) setTab("properties");
  }, [selectedClipId]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.key === "a" || e.key === "A") setTool("select");
      else if (e.key === "b" || e.key === "B") setTool("blade");
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, togglePlay]);

  return (
    <div className="flex h-screen flex-col bg-[#0b0d11] text-[#e6e8ee]">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-white">Video Editor</span>
          {project && (
            <>
              <span className="text-muted">/</span>
              <ProjectNameEditor />
            </>
          )}
        </div>
        {project ? <ResolutionMenu /> : <span className="text-xs text-muted">loading…</span>}
      </header>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="group relative min-h-0 flex-1 overflow-hidden bg-black p-4">
            {useProxy && proxy ? <ProxyPlayer url={proxy.url} /> : <PreviewCanvas />}
            {proxyRendering && (
              <div className="absolute right-6 top-6 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-muted backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Rendering preview…
              </div>
            )}
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

        <aside className="flex w-80 flex-col border-l border-border bg-panel">
          <div className="flex border-b border-border">
            <TabButton active={tab === "project"} onClick={() => setTab("project")} icon={<FolderOpen size={14} />}>
              Project
            </TabButton>
            <TabButton active={tab === "properties"} onClick={() => setTab("properties")} icon={<SlidersHorizontal size={14} />}>
              Properties
            </TabButton>
          </div>
          <div className="min-h-0 flex-1">{tab === "project" ? <ProjectPanel /> : <PropertiesPanel />}</div>
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

function ProjectNameEditor() {
  const name = useEditor((s) => s.project?.name ?? "");
  const setName = useEditor((s) => s.setName);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, name]);

  const commit = () => {
    const v = value.trim();
    if (v && v !== name) setName(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded border border-border bg-elevated px-2 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="rounded px-1 text-sm text-white hover:bg-elevated" title="Rename project">
      {name || "Untitled"}
    </button>
  );
}

const RESOLUTION_PRESETS = [
  { label: "YouTube", sub: "1920×1080 · 16:9", w: 1920, h: 1080 },
  { label: "Reels / TikTok", sub: "1080×1920 · 9:16", w: 1080, h: 1920 },
  { label: "Square", sub: "1080×1080 · 1:1", w: 1080, h: 1080 },
  { label: "YouTube Shorts", sub: "1080×1920 · 9:16", w: 1080, h: 1920 },
];

function ResolutionMenu() {
  const width = useEditor((s) => s.project?.width ?? 0);
  const height = useEditor((s) => s.project?.height ?? 0);
  const setResolution = useEditor((s) => s.setResolution);
  const [open, setOpen] = useState(false);
  const [customW, setCustomW] = useState(String(width));
  const [customH, setCustomH] = useState(String(height));

  useEffect(() => {
    setCustomW(String(width));
    setCustomH(String(height));
  }, [width, height]);

  const applyCustom = () => {
    const w = Math.max(2, Math.round(Number(customW) || 0));
    const h = Math.max(2, Math.round(Number(customH) || 0));
    if (w && h) {
      setResolution(w, h);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-1 text-xs text-muted hover:text-white"
        title="Change resolution"
      >
        {width}×{height}
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-border bg-surface p-1 shadow-xl">
            {RESOLUTION_PRESETS.map((p) => {
              const active = p.w === width && p.h === height;
              return (
                <button
                  key={p.label + p.w + p.h}
                  onClick={() => {
                    setResolution(p.w, p.h);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-elevated"
                >
                  <span>
                    <span className="text-white">{p.label}</span>
                    <span className="ml-2 text-muted">{p.sub}</span>
                  </span>
                  {active && <Check size={13} className="text-accent" />}
                </button>
              );
            })}
            <div className="my-1 border-t border-border" />
            <div className="px-2 py-1">
              <div className="mb-1 text-[11px] text-muted">Custom</div>
              <div className="flex items-center gap-1">
                <input
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-16 rounded border border-border bg-elevated px-1.5 py-1 text-xs focus:outline-none"
                  inputMode="numeric"
                />
                <span className="text-muted">×</span>
                <input
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="w-16 rounded border border-border bg-elevated px-1.5 py-1 text-xs focus:outline-none"
                  inputMode="numeric"
                />
                <button onClick={applyCustom} className="ml-auto rounded bg-accent px-2 py-1 text-xs text-white">
                  Set
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineToolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const zoomIn = useEditor((s) => s.zoomIn);
  const zoomOut = useEditor((s) => s.zoomOut);
  const scaleWidth = useEditor((s) => s.timelineScaleWidth);

  const toolBtn = (id: "select" | "blade", Icon: typeof MousePointer2, label: string, key: string) => (
    <button
      onClick={() => setTool(id)}
      title={`${label} (${key})`}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
        tool === id ? "bg-accent text-white" : "text-muted hover:bg-elevated hover:text-white"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
      <div className="flex items-center gap-1">
        {toolBtn("select", MousePointer2, "Select", "A")}
        {toolBtn("blade", Scissors, "Cut", "B")}
      </div>
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
