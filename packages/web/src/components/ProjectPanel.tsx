import { useRef, useState } from "react";
import { Upload, Film, Music, Image as ImageIcon, Plus } from "lucide-react";
import type { Asset, TrackType } from "@ve/core";
import { useEditor } from "../store";
import { uploadMedia } from "../api";

const ICONS: Record<Asset["type"], typeof Film> = {
  video: Film,
  audio: Music,
  image: ImageIcon,
};

const TRACK_FOR: Record<Asset["type"], TrackType> = {
  video: "video",
  audio: "audio",
  image: "overlay",
};

export function ProjectPanel() {
  const project = useEditor((s) => s.project);
  const currentTime = useEditor((s) => s.currentTime);
  const update = useEditor((s) => s.update);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!project) return null;

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadMedia(file);
        // Asset is already persisted server-side; reflect it locally too.
        update((draft) => {
          if (!draft.assets.find((a) => a.id === asset.id)) draft.assets.push(asset);
        });
      }
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const addToTimeline = (asset: Asset) => {
    const trackType = TRACK_FOR[asset.type];
    update((draft) => {
      let track = draft.tracks.find((t) => t.type === trackType);
      if (!track) {
        track = { id: `trk_${Date.now()}`, type: trackType, name: trackType, muted: false, clips: [] };
        draft.tracks.push(track);
      }
      const duration = asset.duration || 5;
      track.clips.push({
        id: `clp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        assetId: asset.id,
        start: currentTime,
        duration,
        inPoint: 0,
        outPoint: asset.duration || duration,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
      });
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Files</h2>
        <button
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-xs text-muted hover:text-white"
        >
          <Upload size={14} /> Upload
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {busy && <div className="px-2 py-1 text-xs text-muted">Uploading…</div>}
        {project.assets.length === 0 && !busy && (
          <div className="px-2 py-8 text-center text-xs text-muted">
            No media yet. Click <span className="text-white">Upload</span> to add video, audio or images.
          </div>
        )}
        <ul className="space-y-1">
          {project.assets.map((asset) => {
            const Icon = ICONS[asset.type];
            return (
              <li
                key={asset.id}
                className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-elevated"
              >
                <Icon size={16} className="shrink-0 text-muted" />
                <span className="flex-1 truncate text-xs">{asset.name}</span>
                <button
                  title="Add to timeline"
                  onClick={() => addToTimeline(asset)}
                  className="opacity-0 group-hover:opacity-100"
                >
                  <Plus size={16} className="text-accent" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
