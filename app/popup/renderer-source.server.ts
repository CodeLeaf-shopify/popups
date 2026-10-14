import fs from "node:fs";
import path from "node:path";

let rendererSource: string | null = null;

export function readRendererSource(): string {
  if (rendererSource) return rendererSource;
  const source = fs.readFileSync(
    path.join(process.cwd(), "extensions/leaf-popups-embed/assets/renderer.js"),
    "utf8",
  );
  // Re-read in development so renderer edits show up without restarting the server.
  if (process.env.NODE_ENV === "production") rendererSource = source;
  return source;
}
