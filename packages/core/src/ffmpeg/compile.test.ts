import { test } from "node:test";
import assert from "node:assert/strict";
import { compileProject } from "./compile.js";
import { ProjectSchema, type Project } from "../schema.js";

function sample(): Project {
  return ProjectSchema.parse({
    id: "proj_1",
    name: "Test",
    width: 1280,
    height: 720,
    fps: 30,
    duration: 10,
    assets: [
      { id: "ast_v", path: "/media/a.mp4", name: "a.mp4", type: "video", duration: 8, width: 1280, height: 720 },
    ],
    tracks: [
      {
        id: "trk_v",
        type: "video",
        name: "Video 1",
        clips: [
          { id: "clp_1", assetId: "ast_v", start: 0, duration: 5, inPoint: 1, outPoint: 6, transform: {}, effects: [{ id: "fx1", type: "brightness", value: 0.2 }] },
        ],
      },
      {
        id: "trk_t",
        type: "text",
        name: "Text",
        clips: [{ id: "clp_t", start: 1, duration: 3, inPoint: 0, outPoint: 0, transform: {}, effects: [], text: { content: "Hello", fontSize: 48, color: "#ffffff" } }],
      },
    ],
  });
}

test("compiles a base canvas at the project resolution", () => {
  const { args } = compileProject(sample(), "/out/final.mp4");
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /color=c=black:s=1280x720:r=30/);
});

test("trims the source via input seeking", () => {
  const { args } = compileProject(sample(), "/out/final.mp4");
  // -ss <inPoint> -t <duration> -i <path>
  const i = args.indexOf("/media/a.mp4");
  assert.equal(args[i - 1], "-i");
  assert.equal(args[i - 5], "-ss");
  assert.equal(args[i - 4], "1");
  assert.equal(args[i - 3], "-t");
  assert.equal(args[i - 2], "5");
});

test("emits drawtext for a text clip with its enable window", () => {
  const { args } = compileProject(sample(), "/out/final.mp4");
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /drawtext=text='Hello'/);
  assert.match(fc, /enable='between\(t,1,4\)'/);
});

test("applies brightness via eq", () => {
  const { args } = compileProject(sample(), "/out/final.mp4");
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /eq=brightness=0.2/);
});

test("ends with the output path and a video encoder", () => {
  const { args } = compileProject(sample(), "/out/final.mp4");
  assert.equal(args[args.length - 1], "/out/final.mp4");
  assert.ok(args.includes("libx264"));
});
