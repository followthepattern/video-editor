# Video Editor

A Descript-like video editor that is **also an MCP server**, powered by the
**ffmpeg CLI**. Draft a video programmatically with Claude (via MCP), then refine
clips, overlays and effects in a visual, dark-theme web UI.

## Architecture

```
                       project.json (single source of truth)
                                     │ ProjectStore
                ┌────────────────────┴────────────────────┐
                │            packages/server               │
                │  REST + WebSocket + ffmpeg + MCP (/mcp)   │
                └───────▲───────────────────────▲──────────┘
            live updates│ (WebSocket)            │ MCP over HTTP
                        │                        │
                 packages/web              Claude Code / any MCP client
            timeline + composited preview
```

- **`packages/core`** — shared zod schema, `ProjectStore`, and the ffmpeg layer
  (binary resolver, probe, filtergraph compiler, runner).
- **`packages/server`** — Express REST + WebSocket backend; uploads, streaming,
  export, **and the MCP server mounted at `/mcp`** (streamable HTTP). Editing tools
  mutate the same `project.json`, so changes appear live in the UI.
- **`packages/web`** — React UI: project/files panel, multi-track timeline
  (`@xzdarcy/react-timeline-editor`) with Select/Cut tools and zoom, and a
  real-time Canvas2D composited preview.

## Quick start

```bash
npm install
npm run dev     # starts the backend (:5174) and the web UI (:5173)
```

### FFmpeg

By default the app uses `ffmpeg`/`ffprobe` from your `PATH`. To download and use a
bundled binary instead, set:

```bash
export FFMPEG_SOURCE=download   # uses ffmpeg-static / ffprobe-static
# FFMPEG_SOURCE=system (default) uses ffmpeg/ffprobe on PATH
```

### MCP server

The MCP server is exposed over HTTP by the backend at `/mcp` while it runs
(`npm run dev`). Register it with Claude Code:

```bash
claude mcp add --transport http video-editor http://localhost:5174/mcp
```

Tools: `get_project`, `list_media`, `import_media`, `add_track`, `add_clip`,
`move_clip`, `trim_clip`, `split_clip`, `add_text_overlay`, `add_transition`,
`set_effect`, `remove_clip`, `set_resolution`, `rename_project`, `export_video`,
`render_frame`. They edit the same `project.json` the UI uses, so an open browser
updates live.
