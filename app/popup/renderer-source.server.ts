import fs from "node:fs";
import path from "node:path";

export function readRendererSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "extensions/leaf-popups-embed/assets/renderer.js"),
    "utf8",
  );
}
