import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "./store.js";

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), "ve-test-"));
  const store = await ProjectStore.open(join(dir, "project.json"));
  return { store, dir };
}

test("creates an empty project with default tracks", async () => {
  const { store, dir } = await tempStore();
  try {
    const p = store.get();
    assert.equal(p.tracks.length, 2);
    assert.equal(p.tracks[0].type, "video");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("addAsset + addClip wires up duration and recomputes project duration", async () => {
  const { store, dir } = await tempStore();
  try {
    const asset = await store.addAsset({ path: "/m/a.mp4", name: "a.mp4", type: "video", duration: 12, width: 1920, height: 1080 });
    const track = store.get().tracks[0];
    const clip = await store.addClip(track.id, { assetId: asset.id, start: 2, duration: 4 });
    assert.equal(clip.duration, 4);
    assert.equal(store.get().duration, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("emits change events on mutation", async () => {
  const { store, dir } = await tempStore();
  try {
    let fired = 0;
    store.on("change", () => fired++);
    await store.addTrack("audio");
    assert.equal(fired, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
