import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, basename } from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import chokidar from "chokidar";
import { WebSocketServer, WebSocket } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  ProjectStore,
  probeMedia,
  renderProject,
  extractFrame,
  proxySize,
  newId,
  type Asset,
} from "@ve/core";
import { projectPaths } from "./paths.js";
import { createMcpServer } from "./mcp.js";

const PORT = Number(process.env.PORT || 5174);
const paths = projectPaths();

async function main() {
  await mkdir(paths.mediaDir, { recursive: true });
  await mkdir(paths.exportsDir, { recursive: true });
  await mkdir(paths.cacheDir, { recursive: true });

  const store = await ProjectStore.open(paths.projectFile);

  const app = express();
  app.use(cors({ exposedHeaders: ["Mcp-Session-Id"], allowedHeaders: ["Content-Type", "Mcp-Session-Id"] }));
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
  const sanitizeExportName = (raw: unknown): string => {
    if (typeof raw !== "string") return `export_${newId("x")}`;
    // Strip any path components, then keep only safe characters.
    const base = basename(raw)
      .replace(/\.mp4$/i, "")
      .replace(/[^A-Za-z0-9 _-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
      .slice(0, 80)
      .trim();
    return base || `export_${newId("x")}`;
  };

  app.post("/api/export", async (req, res) => {
    let name = sanitizeExportName(req.body?.name);
    let out = join(paths.exportsDir, `${name}.mp4`);
    if (existsSync(out)) {
      name = `${name}-${newId("x")}`;
      out = join(paths.exportsDir, `${name}.mp4`);
    }
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
      send("done", { file: basename(out), url: `/api/exports/${encodeURIComponent(basename(out))}` });
    } catch (err) {
      send("error", { error: String(err) });
    } finally {
      res.end();
    }
  });

  app.use("/api/exports", express.static(paths.exportsDir));

  // --- Preview proxy: a fast, low-res render of the whole timeline ---------
  const previewFile = join(paths.cacheDir, "preview.mp4");
  app.post("/api/preview", async (_req, res) => {
    try {
      const project = store.get();
      const size = proxySize(project.width, project.height, 720);
      const handle = await renderProject(project, previewFile, { proxy: size, preset: "ultrafast" });
      await handle.done;
      // Cache-bust so the <video> reloads the freshly written file.
      res.json({ url: `/api/preview-file?ts=${Date.now()}` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.get("/api/preview-file", (_req, res) => {
    if (!existsSync(previewFile)) return res.status(404).end();
    res.sendFile(previewFile);
  });

  // --- MCP over HTTP (register with Claude Code) --------------------------
  // Streamable-HTTP with per-session transports, all bound to the shared
  // ProjectStore so edits persist and stream to the UI over WebSocket.
  const mcpTransports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? mcpTransports.get(sessionId) : undefined;

      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "No valid session ID provided" },
            id: null,
          });
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            mcpTransports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) mcpTransports.delete(transport!.sessionId);
        };
        await createMcpServer(store, paths.exportsDir).connect(transport);
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // GET (server->client stream) and DELETE (session teardown) reuse the session.
  const mcpSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? mcpTransports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", mcpSessionRequest);
  app.delete("/mcp", mcpSessionRequest);

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
