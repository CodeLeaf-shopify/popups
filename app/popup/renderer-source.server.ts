// Bundled into the server build so production doesn't depend on the extension folder being on disk.
import rendererSource from "../../extensions/leaf-popups-embed/assets/renderer.js?raw";

export function readRendererSource(): string {
  return rendererSource;
}
