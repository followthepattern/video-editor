import { create } from "zustand";
import type { Project, Clip, Track } from "@ve/core";
import { fetchProject, putProject } from "./api";

interface EditorState {
  project: Project | null;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  /** True while the user is dragging in the timeline (suppresses WS clobber). */
  interacting: boolean;
  /** Timeline zoom: pixels per second (UI-only, not persisted). */
  timelineScaleWidth: number;

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

  init: async () => {
    const project = await fetchProject();
    set({ project });
    connectWs(set, get);
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

  update: (mutator) => {
    const current = get().project;
    if (!current) return;
    const draft: Project = structuredClone(current);
    mutator(draft);
    set({ project: recompute(draft) });
    scheduleSave(get);
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
