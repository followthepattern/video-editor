import { useEffect, useMemo, useRef } from "react";
import {
  Timeline as RTimeline,
  type TimelineRow,
  type TimelineAction,
  type TimelineEffect,
  type TimelineState,
} from "@xzdarcy/react-timeline-editor";
import { useEditor } from "../store";

const TRACK_COLORS: Record<string, string> = {
  video: "#2563eb",
  overlay: "#7c3aed",
  text: "#0891b2",
  audio: "#059669",
};

const effects: Record<string, TimelineEffect> = {
  video: { id: "video", name: "Video" },
  overlay: { id: "overlay", name: "Overlay" },
  text: { id: "text", name: "Text" },
  audio: { id: "audio", name: "Audio" },
};

export function Timeline() {
  const project = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const setTime = useEditor((s) => s.setTime);
  const setInteracting = useEditor((s) => s.setInteracting);
  const scaleWidth = useEditor((s) => s.timelineScaleWidth);
  const zoomIn = useEditor((s) => s.zoomIn);
  const zoomOut = useEditor((s) => s.zoomOut);
  const timelineRef = useRef<TimelineState>(null);

  // Ctrl/Cmd + wheel zooms the timeline.
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  // Push the master clock into the library's cursor imperatively so the
  // component does not re-render on every animation frame.
  useEffect(() => {
    let last = -1;
    return useEditor.subscribe((s) => {
      if (s.currentTime !== last) {
        last = s.currentTime;
        timelineRef.current?.setTime(s.currentTime);
      }
    });
  }, []);

  const editorData: TimelineRow[] = useMemo(() => {
    if (!project) return [];
    return project.tracks.map((track) => ({
      id: track.id,
      actions: track.clips.map<TimelineAction>((clip) => ({
        id: clip.id,
        start: clip.start,
        end: clip.start + clip.duration,
        effectId: track.type,
      })),
    }));
  }, [project]);

  if (!project) return null;

  const labelFor = (clipId: string) => {
    for (const t of project.tracks) {
      const c = t.clips.find((x) => x.id === clipId);
      if (!c) continue;
      if (c.text) return c.text.content || "Text";
      const asset = project.assets.find((a) => a.id === c.assetId);
      return asset?.name ?? "Clip";
    }
    return "Clip";
  };

  const handleChange = (data: TimelineRow[]) => {
    update((draft) => {
      for (const row of data) {
        const track = draft.tracks.find((t) => t.id === row.id);
        if (!track) continue;
        for (const action of row.actions) {
          const clip = track.clips.find((c) => c.id === action.id);
          if (clip) {
            clip.start = action.start;
            clip.duration = Math.max(0.05, action.end - action.start);
          }
        }
      }
    });
  };

  return (
    <div className="h-full w-full" onWheel={onWheel}>
    <RTimeline
      ref={timelineRef}
      style={{ width: "100%", height: "100%" }}
      editorData={editorData}
      effects={effects}
      scale={1}
      scaleWidth={scaleWidth}
      startLeft={24}
      rowHeight={64}
      autoScroll
      onChange={handleChange}
      onActionMoveStart={() => setInteracting(true)}
      onActionResizeStart={() => setInteracting(true)}
      onActionMoveEnd={() => setInteracting(false)}
      onActionResizeEnd={() => setInteracting(false)}
      onClickAction={(_e, { action }) => select(action.id)}
      onCursorDrag={(time) => setTime(time)}
      onClickTimeArea={(time) => {
        setTime(time);
        return true;
      }}
      getActionRender={(action) => {
        const selected = action.id === selectedClipId;
        return (
          <div
            className="flex h-full items-center overflow-hidden rounded-md px-2 text-xs font-medium text-white"
            style={{
              background: TRACK_COLORS[action.effectId] ?? "#374151",
              outline: selected ? "2px solid #fff" : "none",
              outlineOffset: "-2px",
            }}
          >
            <span className="truncate">{labelFor(action.id)}</span>
          </div>
        );
      }}
    />
    </div>
  );
}
