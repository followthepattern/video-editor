# @ve/mcp — Video Editor MCP server

A Model Context Protocol (stdio) server that lets Claude draft and edit videos by
mutating the same `project.json` the web UI uses. With the backend running, every
change appears live in the browser.

## Build & register

```bash
pnpm build   # from the repo root
claude mcp add video-editor \
  -e VE_PROJECT_DIR=/absolute/path/to/projects/default \
  -e FFMPEG_SOURCE=system \
  -- node /absolute/path/to/packages/mcp/dist/index.js
```

## Environment

| Var             | Default                | Meaning                                            |
| --------------- | ---------------------- | -------------------------------------------------- |
| `VE_PROJECT_DIR`| `./projects/default`   | Folder holding `project.json`, `media/`, `exports/`|
| `FFMPEG_SOURCE` | `system`               | `system` (PATH) or `download` (ffmpeg-static)      |
| `FFMPEG_PATH`   | —                      | Explicit ffmpeg binary override                    |
| `FFPROBE_PATH`  | —                      | Explicit ffprobe binary override                   |

## Tools

| Tool               | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `get_project`      | Full project state                                      |
| `list_media`       | Imported assets                                         |
| `import_media`     | Register a local media file by absolute path            |
| `add_track`        | Add a video/audio/overlay/text track                    |
| `add_clip`         | Place an asset on a track                               |
| `move_clip`        | Move a clip (time / track)                              |
| `trim_clip`        | Adjust in/out points & duration                         |
| `add_text_overlay` | Add a centered text clip                                |
| `add_transition`   | Attach a transition to a clip                           |
| `set_effect`       | Set blur/brightness/contrast/saturation/grayscale       |
| `remove_clip`      | Delete a clip                                           |
| `export_video`     | Render to mp4 via ffmpeg                                |
| `render_frame`     | Return a composited JPEG frame at a time (Claude can see)|

## Try it

```bash
npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js
```
