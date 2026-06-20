import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectStore, probeMedia, renderProject, extractFrame, newId } from "@ve/core";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

/**
 * Build an MCP server exposing the video-editor tools, all operating on the
 * shared {@link ProjectStore} (so edits land in the same project.json the UI
 * uses and stream to the browser over WebSocket). Mounted over HTTP by the
 * backend; a fresh instance is created per request in stateless mode.
 */
export function createMcpServer(store: ProjectStore, exportsDir: string): McpServer {
  const server = new McpServer({ name: "video-editor", version: "0.1.0" });

  server.registerTool(
    "get_project",
    { title: "Get project", description: "Return the full project (tracks, clips, assets, resolution).", inputSchema: {} },
    async () => ok(store.get()),
  );

  server.registerTool(
    "list_media",
    { title: "List media", description: "List imported media assets available to place on the timeline.", inputSchema: {} },
    async () => ok(store.get().assets),
  );

  server.registerTool(
    "import_media",
    {
      title: "Import media",
      description: "Register a local media file (video/audio/image) by absolute path.",
      inputSchema: { path: z.string().describe("Absolute path to the media file") },
    },
    async ({ path }) => {
      try {
        const meta = await probeMedia(path);
        const asset = await store.addAsset({ path, name: path.split("/").pop() || path, ...meta });
        return ok(asset);
      } catch (err) {
        return fail(`Failed to import: ${err}`);
      }
    },
  );

  server.registerTool(
    "add_track",
    {
      title: "Add track",
      description: "Add a new track (video, audio, overlay or text).",
      inputSchema: { type: z.enum(["video", "audio", "overlay", "text"]), name: z.string().optional() },
    },
    async ({ type, name }) => ok(await store.addTrack(type, name)),
  );

  server.registerTool(
    "add_clip",
    {
      title: "Add clip",
      description: "Place an asset on a track at a given start time.",
      inputSchema: {
        trackId: z.string(),
        assetId: z.string(),
        start: z.number().default(0),
        duration: z.number().optional().describe("Defaults to the asset duration"),
        inPoint: z.number().optional(),
        outPoint: z.number().optional(),
      },
    },
    async (args) => {
      try {
        return ok(await store.addClip(args.trackId, args));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "move_clip",
    {
      title: "Move clip",
      description: "Move a clip to a new start time and optionally a different track.",
      inputSchema: { clipId: z.string(), start: z.number(), toTrackId: z.string().optional() },
    },
    async ({ clipId, start, toTrackId }) => {
      try {
        return ok(await store.moveClip(clipId, start, toTrackId));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "trim_clip",
    {
      title: "Trim clip",
      description: "Adjust a clip's in/out points and/or timeline duration.",
      inputSchema: { clipId: z.string(), inPoint: z.number().optional(), outPoint: z.number().optional(), duration: z.number().optional() },
    },
    async ({ clipId, ...patch }) => {
      try {
        return ok(await store.trimClip(clipId, patch));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "split_clip",
    {
      title: "Split clip",
      description: "Cut a clip into two at a timeline time (seconds).",
      inputSchema: { clipId: z.string(), time: z.number().describe("Timeline time in seconds") },
    },
    async ({ clipId, time }) => {
      try {
        return ok(await store.splitClip(clipId, time));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "add_text_overlay",
    {
      title: "Add text overlay",
      description: "Add a centered text overlay clip on a track.",
      inputSchema: {
        trackId: z.string(),
        content: z.string(),
        start: z.number().default(0),
        duration: z.number().default(5),
        fontSize: z.number().default(48),
        color: z.string().default("#ffffff"),
      },
    },
    async ({ trackId, content, start, duration, fontSize, color }) => {
      try {
        return ok(await store.addTextOverlay(trackId, { content, fontSize, color }, { start, duration }));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "add_transition",
    {
      title: "Add transition",
      description: "Attach a transition (e.g. fade) to a clip.",
      inputSchema: { clipId: z.string(), type: z.string().default("fade"), duration: z.number().default(0.5) },
    },
    async ({ clipId, type, duration }) => {
      try {
        return ok(await store.addTransition(clipId, { type, duration }));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "set_transform",
    {
      title: "Set transform",
      description:
        "Adjust a clip's position, scale, rotation and opacity. Only the provided fields change. " +
        "x/y are pixel offsets from center, scale is a multiplier (1 = original), rotation is in degrees, opacity is 0-1.",
      inputSchema: {
        clipId: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        scale: z.number().positive().optional(),
        rotation: z.number().optional(),
        opacity: z.number().min(0).max(1).optional(),
      },
    },
    async ({ clipId, ...patch }) => {
      try {
        return ok(await store.setTransform(clipId, patch));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "set_effect",
    {
      title: "Set effect",
      description: "Set/replace an effect on a clip (blur, brightness, contrast, saturation, grayscale).",
      inputSchema: {
        clipId: z.string(),
        type: z.enum(["blur", "brightness", "contrast", "saturation", "grayscale"]),
        value: z.number().default(0),
      },
    },
    async ({ clipId, type, value }) => {
      try {
        return ok(await store.setEffect(clipId, { type, value }));
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "remove_clip",
    { title: "Remove clip", description: "Remove a clip from the timeline.", inputSchema: { clipId: z.string() } },
    async ({ clipId }) => {
      try {
        await store.removeClip(clipId);
        return ok({ removed: clipId });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "set_resolution",
    {
      title: "Set resolution",
      description: "Set the project output resolution and optional fps.",
      inputSchema: { width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().positive().optional() },
    },
    async ({ width, height, fps }) => ok(await store.setMeta({ width, height, ...(fps ? { fps } : {}) })),
  );

  server.registerTool(
    "rename_project",
    { title: "Rename project", description: "Set the project name.", inputSchema: { name: z.string() } },
    async ({ name }) => ok(await store.setMeta({ name })),
  );

  server.registerTool(
    "export_video",
    {
      title: "Export video",
      description: "Render the project to an mp4 with ffmpeg and return the output path.",
      inputSchema: { name: z.string().optional().describe("Output file name (without extension)") },
    },
    async ({ name }) => {
      try {
        await mkdir(exportsDir, { recursive: true });
        const safe = (name || store.get().name || "export").replace(/[^A-Za-z0-9 _-]+/g, "-");
        const out = join(exportsDir, `${safe}_${newId("x")}.mp4`);
        const handle = await renderProject(store.get(), out);
        await handle.done;
        return ok({ output: out });
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  server.registerTool(
    "render_frame",
    {
      title: "Render frame",
      description: "Render the project and return a single composited frame (JPEG) at the given time, so you can see the result.",
      inputSchema: { time: z.number().default(0).describe("Time in seconds") },
    },
    async ({ time }) => {
      try {
        const tmp = join(tmpdir(), `${newId("render")}.mp4`);
        const handle = await renderProject(store.get(), tmp);
        await handle.done;
        const frame = join(tmpdir(), `${newId("frame")}.jpg`);
        await extractFrame(tmp, time, frame);
        const data = await readFile(frame);
        return { content: [{ type: "image" as const, data: data.toString("base64"), mimeType: "image/jpeg" }] };
      } catch (err) {
        return fail(String(err));
      }
    },
  );

  return server;
}
