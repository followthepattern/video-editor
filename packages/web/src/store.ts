import { create } from "zustand";
import type { Project, Clip, Track, TrackType } from "@ve/core";
import { fetchProject, putProject, renderPreview } from "./api";

interface EditorState {
  project: Project | null;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  /** True while the user is dragging in the timeline (suppresses WS clobber). */
  interacting: boolean;
  /** Timeline zoom: pixels per second (UI-only, not persisted). */
  timelineScaleWidth: number;
  /** Active timeline tool (UI-only). */
  tool: "select" | "blade";
  /** Bumped on every edit; used to tell whether the proxy is still fresh. */
  revision: number;
  /** Latest rendered preview proxy and the revision it was rendered for. */
  proxy: { url: string; rev: number } | null;
  /** True while a preview proxy render is in flight. */
  proxyRendering: boolean;

  init: () => Promise<void>;
  setProjectFromServer: (p: Project) => void;
  select: (clipId: string | null) => void;
  setTime: (t: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setInteracting: (v: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTool: (t: "select" | "blade") => void;
  setName: (name: string) => void;
  setResolution: (width: number, height: number) => void;
  splitClipAt: (clipId: string, t: number) => void;
  addTrack: (type: TrackType) => void;

  /** Apply a local mutation to the project and persist it (debounced). */
  update: (mutator: (draft: Project) => void) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(get: () => EditorState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p = get().project;
    if (p) putProject(p).catch((e) => console.error("save failed", e));
  }, 250);
}

let proxyTimer: ReturnType<typeof setTimeout> | null = null;

/** Re-render the preview proxy a couple seconds after the last edit. */
function scheduleProxy(set: (p: Partial<EditorState>) => void, get: () => EditorState) {
  if (proxyTimer) clearTimeout(proxyTimer);
  proxyTimer = setTimeout(async () => {
    const p = get().project;
    if (!p || p.tracks.every((t) => t.clips.length === 0)) return;
    const rev = get().revision; // stable: no edits for the debounce window
    set({ proxyRendering: true });
    try {
      const { url } = await renderPreview();
      set({ proxy: { url, rev }, proxyRendering: false });
    } catch (e) {
      console.error("preview render failed", e);
      set({ proxyRendering: false });
    }
  }, 1500);
}

function recompute(project: Project): Project {
  let duration = 0;
  for (const t of project.tracks)
    for (const c of t.clips) duration = Math.max(duration, c.start + c.duration);
  return { ...project, duration };
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  selectedClipId: null,
  currentTime: 0,
  isPlaying: false,
  interacting: false,
  timelineScaleWidth: 100,
  tool: "select",
  revision: 0,
  proxy: null,
  proxyRendering: false,

  init: async () => {
    const project = await fetchProject();
    set({ project });
    connectWs(set, get);
    scheduleProxy(set, get);
  },

  setProjectFromServer: (p) => {
    // Don't overwrite local state mid-interaction.
    if (get().interacting) return;
    set({ project: p });
  },

  select: (selectedClipId) => set({ selectedClipId }),
  setTime: (t) => set({ currentTime: Math.max(0, t) }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setInteracting: (interacting) => set({ interacting }),
  zoomIn: () =>
    set((s) => ({ timelineScaleWidth: Math.min(600, Math.round(s.timelineScaleWidth * 1.5)) })),
  zoomOut: () =>
    set((s) => ({ timelineScaleWidth: Math.max(20, Math.round(s.timelineScaleWidth / 1.5)) })),
  setTool: (tool) => set({ tool }),
  setName: (name) => get().update((draft) => void (draft.name = name)),
  addTrack: (type) =>
    get().update((draft) => {
      const n = draft.tracks.filter((t) => t.type === type).length + 1;
      draft.tracks.push({
        id: `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        name: `${type[0].toUpperCase()}${type.slice(1)} ${n}`,
        muted: false,
        clips: [],
      });
    }),
  setResolution: (width, height) =>
    get().update((draft) => {
      draft.width = width;
      draft.height = height;
    }),
  splitClipAt: (clipId, t) =>
    get().update((draft) => {
      for (const track of draft.tracks) {
        const i = track.clips.findIndex((c) => c.id === clipId);
        if (i === -1) continue;
        const clip = track.clips[i];
        const end = clip.start + clip.duration;
        if (t <= clip.start + 0.01 || t >= end - 0.01) return;
        const offset = t - clip.start;
        const right: Clip = {
          ...structuredClone(clip),
          id: `clp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          start: t,
          duration: end - t,
          inPoint: clip.inPoint + offset,
        };
        clip.duration = offset;
        clip.outPoint = clip.inPoint + offset;
        track.clips.splice(i + 1, 0, right);
        return;
      }
    }),

  update: (mutator) => {
    const current = get().project;
    if (!current) return;
    const draft: Project = structuredClone(current);
    mutator(draft);
    // Bump revision so the existing proxy is considered stale (live preview
    // takes over) and schedule a fresh proxy render once editing settles.
    set({ project: recompute(draft), revision: get().revision + 1 });
    scheduleSave(get);
    scheduleProxy(set, get);
  },
}));

function connectWs(set: (p: Partial<EditorState>) => void, get: () => EditorState) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "project") get().setProjectFromServer(msg.project);
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => setTimeout(() => connectWs(set, get), 1500);
}

// Selector helpers ---------------------------------------------------------
export function findClip(project: Project | null, clipId: string | null): { track: Track; clip: Clip } | null {
  if (!project || !clipId) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}
