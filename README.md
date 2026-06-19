# Video Editor

A Descript-like video editor that is **also an MCP server**, powered by the
**ffmpeg CLI**. Draft a video programmatically with Claude (via MCP), then refine
clips, overlays and effects in a visual, dark-theme web UI.

## Architecture

```
                 project.json (single source of truth, on disk)
                          ▲           ▲
            ProjectStore  │           │  ProjectStore
        ┌─────────────────┘           └──────────────────┐
        │                                                  │
  packages/server (Express + WS)                  packages/mcp (MCP stdio)
        │  REST + WebSocket + ffmpeg                       │  tools for Claude
        ▼                                                  │
  packages/web (React + Vite)  ◄── live updates over WS ───┘
   timeline + PixiJS composited preview
```

- **`packages/core`** — shared zod schema, `ProjectStore`, and the ffmpeg layer
  (binary resolver, probe, filtergraph compiler, runner).
- **`packages/server`** — Express REST + WebSocket backend; uploads, streaming,
  export. Watches `project.json` so MCP edits appear live in the UI.
- **`packages/mcp`** — Model Context Protocol stdio server exposing editing/export
  tools that mutate the same `project.json`.
- **`packages/web`** — React UI: project/files panel, multi-track timeline
  (`@xzdarcy/react-timeline-editor`), and a real-time PixiJS composited preview.

## Quick start

```bash
pnpm install
pnpm dev        # starts the backend (:5174) and the web UI (:5173)
```

### FFmpeg

By default the app uses `ffmpeg`/`ffprobe` from your `PATH`. To download and use a
bundled binary instead, set:

```bash
export FFMPEG_SOURCE=download   # uses ffmpeg-static / ffprobe-static
# FFMPEG_SOURCE=system (default) uses ffmpeg/ffprobe on PATH
```

### MCP server

```bash
pnpm build
claude mcp add video-editor -- node /absolute/path/to/packages/mcp/dist/index.js
```

See `packages/mcp/README.md` for the full tool list and env vars.
