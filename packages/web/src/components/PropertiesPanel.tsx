import { Trash2 } from "lucide-react";
import type { Effect, Project } from "@ve/core";
import { useEditor, findClip } from "../store";

const EFFECT_TYPES: Effect["type"][] = ["blur", "brightness", "contrast", "saturation", "grayscale"];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}

export function PropertiesPanel() {
  const project = useEditor((s) => s.project);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);

  const found = findClip(project, selectedClipId);

  if (!found) {
    return (
      <div className="p-4 text-xs text-muted">Select a clip to edit its properties.</div>
    );
  }

  const { clip } = found;

  const patchClip = (fn: (p: Project) => void) => update(fn);

  const setTransform = (key: keyof typeof clip.transform, value: number) =>
    patchClip((draft) => {
      const c = findClip(draft, clip.id)?.clip;
      if (c) c.transform[key] = value;
    });

  const setEffectValue = (type: Effect["type"], value: number) =>
    patchClip((draft) => {
      const c = findClip(draft, clip.id)?.clip;
      if (!c) return;
      const existing = c.effects.find((e) => e.type === type);
      if (existing) existing.value = value;
      else c.effects.push({ id: `fx_${type}`, type, value });
    });

  const removeEffect = (type: Effect["type"]) =>
    patchClip((draft) => {
      const c = findClip(draft, clip.id)?.clip;
      if (c) c.effects = c.effects.filter((e) => e.type !== type);
    });

  const deleteClip = () =>
    patchClip((draft) => {
      for (const t of draft.tracks) t.clips = t.clips.filter((c) => c.id !== clip.id);
    });

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Properties</h2>
        <button onClick={() => { deleteClip(); select(null); }} className="text-muted hover:text-red-400" title="Delete clip">
          <Trash2 size={16} />
        </button>
      </div>

      {clip.text && (
        <div className="mb-5 space-y-2">
          <div className="text-xs font-semibold text-muted">Text</div>
          <input
            value={clip.text.content}
            onChange={(e) =>
              patchClip((draft) => {
                const c = findClip(draft, clip.id)?.clip;
                if (c?.text) c.text.content = e.target.value;
              })
            }
            className="w-full rounded-md border border-border bg-elevated px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="mb-5 space-y-3">
        <div className="text-xs font-semibold text-muted">Transform</div>
        <Slider label="X" value={clip.transform.x} min={-960} max={960} step={1} onChange={(v) => setTransform("x", v)} />
        <Slider label="Y" value={clip.transform.y} min={-540} max={540} step={1} onChange={(v) => setTransform("y", v)} />
        <Slider label="Scale" value={clip.transform.scale} min={0.1} max={3} step={0.01} onChange={(v) => setTransform("scale", v)} />
        <Slider label="Rotation" value={clip.transform.rotation} min={-180} max={180} step={1} onChange={(v) => setTransform("rotation", v)} />
        <Slider label="Opacity" value={clip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => setTransform("opacity", v)} />
      </div>

      <div className="space-y-3">
        <div className="text-xs font-semibold text-muted">Effects</div>
        {EFFECT_TYPES.map((type) => {
          const fx = clip.effects.find((e) => e.type === type);
          const ranges: Record<Effect["type"], [number, number, number]> = {
            blur: [0, 20, 0.5],
            brightness: [-1, 1, 0.01],
            contrast: [0, 3, 0.01],
            saturation: [0, 3, 0.01],
            grayscale: [0, 1, 1],
          };
          const [min, max, step] = ranges[type];
          return (
            <div key={type} className="rounded-md border border-border p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs capitalize">{type}</span>
                {fx && (
                  <button onClick={() => removeEffect(type)} className="text-[10px] text-muted hover:text-red-400">
                    remove
                  </button>
                )}
              </div>
              {type === "grayscale" ? (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={!!fx}
                    onChange={(e) => (e.target.checked ? setEffectValue(type, 1) : removeEffect(type))}
                  />
                  enabled
                </label>
              ) : (
                <Slider label="" value={fx?.value ?? (type === "contrast" || type === "saturation" ? 1 : 0)} min={min} max={max} step={step} onChange={(v) => setEffectValue(type, v)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
