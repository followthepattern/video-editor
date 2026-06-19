import { existsSync } from "node:fs";

/**
 * Resolves the ffmpeg/ffprobe binaries based on configuration.
 *
 *   FFMPEG_SOURCE=system   (default) -> use `ffmpeg`/`ffprobe` from PATH
 *   FFMPEG_SOURCE=download           -> use the bundled `ffmpeg-static` /
 *                                       `ffprobe-static` binaries (downloaded as
 *                                       optional npm deps at install time)
 *
 * Explicit overrides FFMPEG_PATH / FFPROBE_PATH always win.
 */

export type FfmpegSource = "system" | "download";

export interface FfmpegBinaries {
  ffmpeg: string;
  ffprobe: string;
  source: FfmpegSource;
}

let cached: FfmpegBinaries | null = null;

export async function resolveFfmpeg(
  source: FfmpegSource = (process.env.FFMPEG_SOURCE as FfmpegSource) || "system",
): Promise<FfmpegBinaries> {
  if (cached) return cached;

  let ffmpeg = process.env.FFMPEG_PATH;
  let ffprobe = process.env.FFPROBE_PATH;

  if (source === "download") {
    if (!ffmpeg) {
      try {
        const mod = await import("ffmpeg-static");
        // ffmpeg-static's default export is the absolute path to the binary.
        ffmpeg = (mod.default as unknown as string) || undefined;
      } catch {
        throw new Error(
          "FFMPEG_SOURCE=download but 'ffmpeg-static' is not installed. Run `npm install` (it is an optional dependency).",
        );
      }
    }
    if (!ffprobe) {
      try {
        const mod = await import("ffprobe-static");
        ffprobe = (mod.default as unknown as { path: string }).path;
      } catch {
        throw new Error(
          "FFMPEG_SOURCE=download but 'ffprobe-static' is not installed.",
        );
      }
    }
  }

  ffmpeg = ffmpeg || "ffmpeg";
  ffprobe = ffprobe || "ffprobe";

  // For absolute paths (download mode / explicit overrides) verify existence.
  if (ffmpeg.includes("/") && !existsSync(ffmpeg)) {
    throw new Error(`ffmpeg binary not found at ${ffmpeg}`);
  }
  if (ffprobe.includes("/") && !existsSync(ffprobe)) {
    throw new Error(`ffprobe binary not found at ${ffprobe}`);
  }

  cached = { ffmpeg, ffprobe, source };
  return cached;
}

/** Reset the cache (mainly for tests). */
export function _resetFfmpegCache(): void {
  cached = null;
}
