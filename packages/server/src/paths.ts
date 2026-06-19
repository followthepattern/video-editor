import { resolve } from "node:path";

/**
 * Resolves the on-disk locations used by both the server and the MCP server.
 * Override with VE_PROJECT_DIR to point both at the same project.
 */
export function projectPaths(projectDir = process.env.VE_PROJECT_DIR) {
  const dir = resolve(projectDir || resolve(process.cwd(), "../../projects/default"));
  return {
    dir,
    projectFile: resolve(dir, "project.json"),
    mediaDir: resolve(dir, "media"),
    exportsDir: resolve(dir, "exports"),
    cacheDir: resolve(dir, "cache"),
  };
}

export type ProjectPaths = ReturnType<typeof projectPaths>;
