import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveFfmpeg } from "./resolve.js";
import type { AssetType } from "../schema.js";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  type: AssetType;
  duration: number;
  width: number;
  height: number;
}

/** Inspect a media file with ffprobe and return normalized metadata. */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { ffprobe } = await resolveFfmpeg();
  const { stdout } = await execFileAsync(ffprobe, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      duration?: string;
    }>;
  };

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const duration = Number(data.format?.duration ?? video?.duration ?? 0) || 0;

  let type: AssetType = "audio";
  if (video) type = duration > 0 ? "video" : "image";

  return {
    type,
    duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
  };
}
