import { test } from "node:test";
import assert from "node:assert/strict";
import { proxySize } from "./run.js";

test("caps the longest side and keeps even dimensions", () => {
  assert.deepEqual(proxySize(1920, 1080, 720), { width: 720, height: 404 });
  assert.deepEqual(proxySize(1080, 1920, 720), { width: 404, height: 720 });
});

test("leaves small sources unchanged (but even)", () => {
  assert.deepEqual(proxySize(640, 360, 720), { width: 640, height: 360 });
});
