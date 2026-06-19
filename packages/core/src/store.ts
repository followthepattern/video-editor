import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  ProjectSchema,
  computeDuration,
  type Project,
  type Asset,
  type Clip,
  type Effect,
  type Track,
  type TrackType,
  type Transform,
  type TextOverlay,
  type Transition,
} from "./schema.js";
import { newId } from "./ids.js";

export function createEmptyProject(name = "Untitled"): Project {
  return ProjectSchema.parse({
    id: newId("proj"),
    name,
    tracks: [
      { id: newId("trk"), type: "video", name: "Video 1", clips: [] },
      { id: newId("trk"), type: "audio", name: "Audio 1", clips: [] },
    ],
  });
}

/**
 * Owns a single `project.json` file and all mutation logic. Shared by the
 * Express backend and the MCP server so editing behaviour lives in exactly one
 * place. Emits a `"change"` event after every successful mutation so callers can
 * broadcast updates (e.g. over WebSocket).
 */
export class ProjectStore extends EventEmitter {
  readonly path: string;
  private project: Project;

  private constructor(path: string, project: Project) {
    super();
    this.path = path;
    this.project = project;
  }

  /** Load the store from disk, creating a fresh project file if missing. */
  static async open(path: string): Promise<ProjectStore> {
    if (existsSync(path)) {
      const raw = await readFile(path, "utf8");
      const project = ProjectSchema.parse(JSON.parse(raw));
      return new ProjectStore(path, project);
    }
    const project = createEmptyProject();
    const store = new ProjectStore(path, project);
    await store.persist();
    return store;
  }

  get(): Project {
    return this.project;
  }

  /** Replace the in-memory project (used when an external write is detected). */
  async reloadFromDisk(): Promise<void> {
    const raw = await readFile(this.path, "utf8");
    this.project = ProjectSchema.parse(JSON.parse(raw));
    this.emit("change", this.project);
  }

  /** Validate + replace the whole project (used by the UI's debounced PUT). */
  async replace(next: unknown): Promise<Project> {
    this.project = ProjectSchema.parse(next);
    await this.save();
    return this.project;
  }

  private async persist(): Promise<void> {
    this.project.duration = computeDuration(this.project);
    await mkdir(dirname(this.path), { recursive: true });
    // Atomic write: write to a temp file then rename.
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(this.project, null, 2), "utf8");
    await rename(tmp, this.path);
  }

  /** Persist + notify. Call after every mutation. */
  private async save(): Promise<Project> {
    await this.persist();
    this.emit("change", this.project);
    return this.project;
  }

  // ---- Mutations -----------------------------------------------------------

  async addAsset(asset: Omit<Asset, "id"> & { id?: string }): Promise<Asset> {
    const full: Asset = { id: asset.id ?? newId("ast"), ...asset } as Asset;
    this.project.assets.push(full);
    await this.save();
    return full;
  }

  async addTrack(type: TrackType, name?: string): Promise<Track> {
    const track: Track = {
      id: newId("trk"),
      type,
      name: name ?? `${type} ${this.project.tracks.length + 1}`,
      muted: false,
      clips: [],
    };
    this.project.tracks.push(track);
    await this.save();
    return track;
  }

  private requireTrack(trackId: string): Track {
    const track = this.project.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error(`Track not found: ${trackId}`);
    return track;
  }

  private findClip(clipId: string): { track: Track; clip: Clip } {
    for (const track of this.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    throw new Error(`Clip not found: ${clipId}`);
  }

  async addClip(
    trackId: string,
    clip: Partial<Clip> & { assetId?: string },
  ): Promise<Clip> {
    const track = this.requireTrack(trackId);
    const asset = clip.assetId
      ? this.project.assets.find((a) => a.id === clip.assetId)
      : undefined;
    const duration = clip.duration ?? asset?.duration ?? 5;
    const full: Clip = {
      id: newId("clp"),
      assetId: clip.assetId,
      start: clip.start ?? 0,
      duration: Math.max(0.05, duration),
      inPoint: clip.inPoint ?? 0,
      outPoint: clip.outPoint ?? (asset?.duration || duration),
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...clip.transform },
      effects: clip.effects ?? [],
      transition: clip.transition,
      text: clip.text,
    };
    track.clips.push(full);
    await this.save();
    return full;
  }

  async moveClip(clipId: string, start: number, toTrackId?: string): Promise<Clip> {
    const { track, clip } = this.findClip(clipId);
    clip.start = Math.max(0, start);
    if (toTrackId && toTrackId !== track.id) {
      track.clips = track.clips.filter((c) => c.id !== clipId);
      this.requireTrack(toTrackId).clips.push(clip);
    }
    await this.save();
    return clip;
  }

  async trimClip(
    clipId: string,
    patch: { inPoint?: number; outPoint?: number; duration?: number },
  ): Promise<Clip> {
    const { clip } = this.findClip(clipId);
    if (patch.inPoint != null) clip.inPoint = Math.max(0, patch.inPoint);
    if (patch.outPoint != null) clip.outPoint = Math.max(0, patch.outPoint);
    if (patch.duration != null) clip.duration = Math.max(0.05, patch.duration);
    await this.save();
    return clip;
  }

  async setTransform(clipId: string, transform: Partial<Transform>): Promise<Clip> {
    const { clip } = this.findClip(clipId);
    clip.transform = { ...clip.transform, ...transform };
    await this.save();
    return clip;
  }

  async setEffect(clipId: string, effect: Omit<Effect, "id"> & { id?: string }): Promise<Effect> {
    const { clip } = this.findClip(clipId);
    const existing = clip.effects.find((e) => e.type === effect.type);
    if (existing) {
      existing.value = effect.value;
      await this.save();
      return existing;
    }
    const full: Effect = { id: effect.id ?? newId("fx"), ...effect } as Effect;
    clip.effects.push(full);
    await this.save();
    return full;
  }

  async addTransition(clipId: string, transition: Transition): Promise<Clip> {
    const { clip } = this.findClip(clipId);
    clip.transition = transition;
    await this.save();
    return clip;
  }

  async addTextOverlay(
    trackId: string,
    text: TextOverlay,
    opts: { start?: number; duration?: number } = {},
  ): Promise<Clip> {
    return this.addClip(trackId, {
      start: opts.start ?? 0,
      duration: opts.duration ?? 5,
      text,
    });
  }

  async removeClip(clipId: string): Promise<void> {
    const { track } = this.findClip(clipId);
    track.clips = track.clips.filter((c) => c.id !== clipId);
    await this.save();
  }

  async setMeta(patch: Partial<Pick<Project, "name" | "width" | "height" | "fps">>): Promise<Project> {
    Object.assign(this.project, patch);
    return this.save();
  }
}
