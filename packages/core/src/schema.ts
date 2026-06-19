import { z } from "zod";

/**
 * The project schema is the single source of truth shared by the web UI, the
 * Express backend and the MCP server. It is intentionally small and declarative
 * so it can be (a) serialized to `project.json`, (b) rendered by the browser
 * preview, and (c) compiled to an ffmpeg filtergraph for export.
 *
 * Time is expressed in **seconds** (floating point) everywhere.
 */

export const AssetTypeSchema = z.enum(["video", "audio", "image"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  /** Path on disk relative to the project's media directory, or absolute. */
  path: z.string(),
  /** Original display name. */
  name: z.string(),
  type: AssetTypeSchema,
  /** Duration in seconds (0 for still images). */
  duration: z.number().nonnegative().default(0),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
});
export type Asset = z.infer<typeof AssetSchema>;

/** Per-clip 2D transform applied in the preview and on export. */
export const TransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof TransformSchema>;

export const EffectSchema = z.object({
  id: z.string(),
  type: z.enum(["blur", "brightness", "contrast", "saturation", "grayscale"]),
  /** Single scalar parameter, meaning depends on `type`. */
  value: z.number().default(0),
});
export type Effect = z.infer<typeof EffectSchema>;

export const TransitionSchema = z.object({
  /** xfade transition name (e.g. "fade", "wipeleft", "dissolve"). */
  type: z.string().default("fade"),
  duration: z.number().positive().default(0.5),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const TextSchema = z.object({
  content: z.string().default(""),
  fontSize: z.number().positive().default(48),
  color: z.string().default("#ffffff"),
});
export type TextOverlay = z.infer<typeof TextSchema>;

export const ClipSchema = z.object({
  id: z.string(),
  /** References Asset.id. Omitted for pure text clips. */
  assetId: z.string().optional(),
  /** Start time on the timeline, in seconds. */
  start: z.number().nonnegative().default(0),
  /** Visible duration on the timeline, in seconds. */
  duration: z.number().positive().default(1),
  /** Trim: in/out points within the source asset, in seconds. */
  inPoint: z.number().nonnegative().default(0),
  outPoint: z.number().nonnegative().default(0),
  transform: TransformSchema.default({}),
  effects: z.array(EffectSchema).default([]),
  transition: TransitionSchema.optional(),
  text: TextSchema.optional(),
});
export type Clip = z.infer<typeof ClipSchema>;

export const TrackTypeSchema = z.enum(["video", "audio", "overlay", "text"]);
export type TrackType = z.infer<typeof TrackTypeSchema>;

export const TrackSchema = z.object({
  id: z.string(),
  type: TrackTypeSchema,
  name: z.string().default(""),
  muted: z.boolean().default(false),
  clips: z.array(ClipSchema).default([]),
});
export type Track = z.infer<typeof TrackSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().default("Untitled"),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().positive().default(30),
  /** Total timeline duration in seconds (derived, but cached for convenience). */
  duration: z.number().nonnegative().default(0),
  assets: z.array(AssetSchema).default([]),
  tracks: z.array(TrackSchema).default([]),
  /** Schema version for forward migrations. */
  version: z.literal(1).default(1),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Compute the timeline duration from the furthest clip end. */
export function computeDuration(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clip.duration);
    }
  }
  return end;
}
