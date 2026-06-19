import type { Clip, Effect, Project, Track } from "../schema.js";

export interface CompileOptions {
  /** Whether the ffmpeg binary supports the `drawtext` filter. */
  hasDrawText?: boolean;
  /** Path to write an ASS subtitle file to (used when drawtext is unavailable). */
  assPath?: string;
}

export interface CompileResult {
  /** Full ffmpeg argument list (excluding the binary name). */
  args: string[];
  /** When set, the runner must write `ass.content` to `ass.path` before running. */
  ass?: { path: string; content: string };
}

/** Build the `eq`/blur/etc. filter snippet for a clip's effects. */
function effectFilters(effects: Effect[]): string[] {
  const filters: string[] = [];
  const eq: Record<string, number> = {};
  for (const fx of effects) {
    switch (fx.type) {
      case "blur":
        if (fx.value > 0) filters.push(`gblur=sigma=${fx.value}`);
        break;
      case "brightness":
        eq.brightness = fx.value;
        break;
      case "contrast":
        eq.contrast = fx.value === 0 ? 1 : fx.value;
        break;
      case "saturation":
        eq.saturation = fx.value === 0 ? 1 : fx.value;
        break;
      case "grayscale":
        eq.saturation = 0;
        break;
    }
  }
  const eqParts = Object.entries(eq).map(([k, v]) => `${k}=${v}`);
  if (eqParts.length) filters.push(`eq=${eqParts.join(":")}`);
  return filters;
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Convert #RRGGBB to ASS &HBBGGRR&. */
function assColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

interface TextEvent {
  start: number;
  end: number;
  content: string;
  fontSize: number;
  color: string;
}

function buildAss(project: Project, events: TextEvent[]): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${project.width}`,
    `PlayResY: ${project.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Sans,48,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = events.map((e) => {
    const text = e.content.replace(/[{}]/g, "").replace(/\n/g, "\\N");
    const tags = `{\\an5\\fs${e.fontSize}\\c${assColor(e.color)}}`;
    return `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${tags}${text}`;
  });
  return [...header, ...lines].join("\n");
}

/**
 * Compile a Project into ffmpeg arguments. Produces a base canvas, overlays
 * every visual clip, renders text (via `drawtext` when available, otherwise an
 * ASS file + `subtitles` filter), then mixes audio.
 */
export function compileProject(
  project: Project,
  outputPath: string,
  opts: CompileOptions = {},
): CompileResult {
  const hasDrawText = opts.hasDrawText ?? true;
  const duration = Math.max(
    0.1,
    project.duration ||
      project.tracks.reduce(
        (m, t) => Math.max(m, ...t.clips.map((c) => c.start + c.duration), 0),
        0,
      ),
  );

  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const inputs: string[] = [];
  const filter: string[] = [];
  const audioLabels: string[] = [];
  const textEvents: TextEvent[] = [];

  filter.push(
    `color=c=black:s=${project.width}x${project.height}:r=${project.fps}:d=${duration}[base0]`,
  );

  let inputIndex = 0;
  let baseCounter = 0;
  let currentBase = "base0";

  const visualTracks = project.tracks.filter(
    (t) => t.type === "video" || t.type === "overlay" || t.type === "text",
  );

  const addVisualClip = (clip: Clip, track: Track) => {
    if (clip.text && !clip.assetId) {
      const t = clip.text;
      if (hasDrawText) {
        const next = `base${++baseCounter}`;
        const color = t.color.replace("#", "0x");
        filter.push(
          `[${currentBase}]drawtext=text='${escapeDrawText(t.content)}':` +
            `fontsize=${t.fontSize}:fontcolor=${color}:x=(w-text_w)/2:y=(h-text_h)/2:` +
            `enable='between(t,${clip.start},${clip.start + clip.duration})'[${next}]`,
        );
        currentBase = next;
      } else {
        textEvents.push({
          start: clip.start,
          end: clip.start + clip.duration,
          content: t.content,
          fontSize: t.fontSize,
          color: t.color,
        });
      }
      return;
    }

    const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
    if (!asset || asset.type === "audio") return;

    const trimLen = clip.duration;
    if (asset.type === "image") {
      inputs.push("-loop", "1", "-t", String(trimLen), "-i", asset.path);
    } else {
      inputs.push("-ss", String(clip.inPoint), "-t", String(trimLen), "-i", asset.path);
    }
    const idx = inputIndex++;

    const tf = clip.transform;
    const chain: string[] = [`scale=iw*${tf.scale}:ih*${tf.scale}`];
    if (tf.rotation) chain.push(`rotate=${(tf.rotation * Math.PI) / 180}`);
    chain.push(...effectFilters(clip.effects));
    chain.push("format=rgba");
    if (tf.opacity < 1) chain.push(`colorchannelmixer=aa=${tf.opacity}`);
    // Shift the clip's timestamps so it plays from its start on the timeline;
    // `enable` then reveals it during exactly that window.
    chain.push(`setpts=PTS-STARTPTS+${clip.start}/TB`);

    const vlabel = `v${idx}`;
    filter.push(`[${idx}:v]${chain.join(",")}[${vlabel}]`);

    const x = `(main_w-overlay_w)/2+${tf.x}`;
    const y = `(main_h-overlay_h)/2+${tf.y}`;
    const next = `base${++baseCounter}`;
    filter.push(
      `[${currentBase}][${vlabel}]overlay=x=${x}:y=${y}:` +
        `enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass[${next}]`,
    );
    currentBase = next;

    if (asset.type === "video" && !track.muted) {
      const al = `a${idx}`;
      const delayMs = Math.round(clip.start * 1000);
      filter.push(`[${idx}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[${al}]`);
      audioLabels.push(al);
    }
  };

  for (const track of visualTracks) {
    for (const clip of track.clips) addVisualClip(clip, track);
  }

  // Dedicated audio tracks.
  for (const track of project.tracks) {
    if (track.type !== "audio" || track.muted) continue;
    for (const clip of track.clips) {
      const asset = clip.assetId ? assetById.get(clip.assetId) : undefined;
      if (!asset) continue;
      inputs.push("-ss", String(clip.inPoint), "-t", String(clip.duration), "-i", asset.path);
      const idx = inputIndex++;
      const al = `a${idx}`;
      const delayMs = Math.round(clip.start * 1000);
      filter.push(`[${idx}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[${al}]`);
      audioLabels.push(al);
    }
  }

  // Text via ASS subtitles when drawtext is unavailable.
  let ass: CompileResult["ass"];
  if (!hasDrawText && textEvents.length && opts.assPath) {
    const next = `base${++baseCounter}`;
    // ffmpeg's subtitles filter needs a path with escaped special chars.
    const escaped = opts.assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    filter.push(`[${currentBase}]subtitles='${escaped}'[${next}]`);
    currentBase = next;
    ass = { path: opts.assPath, content: buildAss(project, textEvents) };
  }

  // Final audio mix (or silence).
  let audioOut = "aout";
  if (audioLabels.length === 0) {
    filter.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${duration}[aout]`);
  } else if (audioLabels.length === 1) {
    audioOut = audioLabels[0];
  } else {
    filter.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[aout]`,
    );
  }

  const args: string[] = ["-y", ...inputs, "-filter_complex", filter.join(";")];
  args.push("-map", `[${currentBase}]`, "-map", `[${audioOut}]`);
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  );

  return { args, ass };
}
