import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { resolveFfmpeg } from "./resolve.js";
import { compileProject } from "./compile.js";
import type { Project } from "../schema.js";

const execFileAsync = promisify(execFile);

let drawTextSupport: boolean | null = null;

/** Detect (and cache) whether the resolved ffmpeg supports the drawtext filter. */
export async function hasDrawText(): Promise<boolean> {
  if (drawTextSupport !== null) return drawTextSupport;
  const { ffmpeg } = await resolveFfmpeg();
  try {
    const { stdout } = await execFileAsync(ffmpeg, ["-hide_banner", "-filters"]);
    drawTextSupport = /\bdrawtext\b/.test(stdout);
  } catch {
    drawTextSupport = false;
  }
  return drawTextSupport;
}

export interface RenderHandle {
  /** Promise that resolves with the output path on success. */
  done: Promise<string>;
  /** Kill the running ffmpeg process. */
  cancel: () => void;
}

export interface RenderOptions {
  onProgress?: (progress: { percent: number; timeSec: number }) => void;
}

/** Parse ffmpeg's `-progress pipe:1` key=value stream. */
function parseProgress(chunk: string, totalSec: number, emit: RenderOptions["onProgress"]) {
  if (!emit) return;
  for (const line of chunk.split("\n")) {
    const [key, value] = line.split("=");
    if (key === "out_time_us" && value) {
      const timeSec = Number(value) / 1_000_000;
      const percent = totalSec > 0 ? Math.min(100, (timeSec / totalSec) * 100) : 0;
      emit({ percent, timeSec });
    }
  }
}

/** Compile + render a project to `outputPath`. */
export async function renderProject(
  project: Project,
  outputPath: string,
  opts: RenderOptions = {},
): Promise<RenderHandle> {
  const { ffmpeg } = await resolveFfmpeg();
  await mkdir(dirname(outputPath), { recursive: true });
  const drawText = await hasDrawText();
  const { args, ass } = compileProject(project, outputPath, {
    hasDrawText: drawText,
    assPath: `${outputPath}.ass`,
  });
  if (ass) await writeFile(ass.path, ass.content, "utf8");

  const child = spawn(ffmpeg, args);
  let stderr = "";

  const done = new Promise<string>((resolve, reject) => {
    child.stdout.on("data", (d) => parseProgress(d.toString(), project.duration, opts.onProgress));
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });

  return { done, cancel: () => child.kill("SIGKILL") };
}

/** Extract a single frame at `timeSec` as a JPEG (for thumbnails / Claude). */
export async function extractFrame(
  inputPath: string,
  timeSec: number,
  outputPath: string,
): Promise<string> {
  const { ffmpeg } = await resolveFfmpeg();
  await mkdir(dirname(outputPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-ss",
      String(timeSec),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outputPath,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(outputPath) : reject(new Error(`ffmpeg frame extract failed: ${stderr}`)),
    );
  });
}
