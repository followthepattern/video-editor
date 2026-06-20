import type { Project, Asset } from "@ve/core";

export const mediaUrl = (assetId: string) => `/api/media/${assetId}`;

export async function fetchProject(): Promise<Project> {
  const res = await fetch("/api/project");
  return res.json();
}

export async function putProject(project: Project): Promise<Project> {
  const res = await fetch("/api/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`PUT /api/project failed: ${res.status}`);
  return res.json();
}

export async function uploadMedia(file: File): Promise<Asset> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media", { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

export interface ExportEvent {
  type: "progress" | "done" | "error";
  data: unknown;
}

/**
 * Save a rendered export to disk. Uses the File System Access API so the user
 * can choose the destination folder + filename; falls back to a normal
 * download where that API is unavailable (e.g. Safari/Firefox).
 */
export async function saveExport(
  url: string,
  suggestedName: string,
): Promise<"saved" | "downloaded"> {
  const res = await fetch(url);
  const blob = await res.blob();
  const picker = (window as unknown as {
    showSaveFilePicker?: (o: unknown) => Promise<{
      createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName,
      types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
  return "downloaded";
}

/** Run an export and stream Server-Sent-Events back to the caller. */
export async function exportVideo(
  name: string,
  onEvent: (e: ExportEvent) => void,
): Promise<void> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.body) throw new Error("no response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine && dataLine) {
        onEvent({
          type: eventLine.slice(7).trim() as ExportEvent["type"],
          data: JSON.parse(dataLine.slice(6)),
        });
      }
    }
  }
}
