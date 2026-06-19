import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import chokidar from "chokidar";
import { WebSocketServer, WebSocket } from "ws";
import {
  ProjectStore,
  probeMedia,
  renderProject,
  extractFrame,
  newId,
  type Asset,
} from "@ve/core";
import { projectPaths } from "./paths.js";

const PORT = Number(process.env.PORT || 5174);
const paths = projectPaths();

async function main() {
  await mkdir(paths.mediaDir, { recursive: true });
  await mkdir(paths.exportsDir, { recursive: true });
  await mkdir(paths.cacheDir, { recursive: true });

  const store = await ProjectStore.open(paths.projectFile);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // --- WebSocket: broadcast project changes -------------------------------
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const broadcast = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "project", project: store.get() }));
  });

  // Internal mutations (UI PUT, MCP edits) emit "change".
  store.on("change", (project) => broadcast({ type: "project", project }));

  // Detect external writes to project.json (e.g. by the MCP server in a
  // separate process) and reload + rebroadcast.
  let ignoreNextWatch = false;
  const watcher = chokidar.watch(paths.projectFile, { ignoreInitial: true });
  watcher.on("change", async () => {
    if (ignoreNextWatch) {
      ignoreNextWatch = false;
      return;
    }
    try {
      await store.reloadFromDisk();
    } catch {
      /* partial write; ignore until next event */
    }
  });
  // Our own saves also touch the file; swallow the immediate echo.
  store.on("change", () => {
    ignoreNextWatch = true;
  });

  // --- Project REST -------------------------------------------------------
  app.get("/api/project", (_req, res) => res.json(store.get()));

  app.put("/api/project", async (req, res) => {
    try {
      const project = await store.replace(req.body);
      res.json(project);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Media --------------------------------------------------------------
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, paths.mediaDir),
      filename: (_req, file, cb) => cb(null, `${newId("file")}${extname(file.originalname)}`),
    }),
  });

  app.post("/api/media", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    try {
      const meta = await probeMedia(req.file.path);
      const asset = await store.addAsset({
        path: req.file.path,
        name: req.file.originalname,
        ...meta,
      });
      res.json(asset);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Stream a media file with HTTP range support (needed for <video> seeking).
  app.get("/api/media/:id", (req, res) => {
    const asset = store.get().assets.find((a: Asset) => a.id === req.params.id);
    if (!asset || !existsSync(asset.path)) return res.status(404).end();
    res.sendFile(asset.path);
  });

  // --- Thumbnail / single frame ------------------------------------------
  app.get("/api/thumb/:assetId", async (req, res) => {
    const asset = store.get().assets.find((a: Asset) => a.id === req.params.assetId);
    if (!asset) return res.status(404).end();
    const time = Number(req.query.t || 0);
    const out = join(paths.cacheDir, `${asset.id}_${time}.jpg`);
    try {
      if (!existsSync(out)) await extractFrame(asset.path, time, out);
      res.sendFile(out);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Export -------------------------------------------------------------
  app.post("/api/export", async (_req, res) => {
    const out = join(paths.exportsDir, `${newId("export")}.mp4`);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const handle = await renderProject(store.get(), out, {
        onProgress: (p) => send("progress", p),
      });
      await handle.done;
      send("done", { file: basename(out), url: `/api/exports/${basename(out)}` });
    } catch (err) {
      send("error", { error: String(err) });
    } finally {
      res.end();
    }
  });

  app.use("/api/exports", express.static(paths.exportsDir));

  // --- Serve built web app in production ----------------------------------
  const webDist = join(process.cwd(), "../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  httpServer.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}  (project: ${paths.projectFile})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
