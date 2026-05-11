import { heicToPngBlob, icoToPngBlob, tiffToCanvas, canvasToIcoBlob } from "./image-decode";

export type ImageBatchOptions = {
  maxWidth?: number;
  maxHeight?: number;
  cropPct?: { x: number; y: number; w: number; h: number };
  compressQuality?: number;
};

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i + 1).toLowerCase() : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Rasterize file to HTMLCanvasElement (browser-decodable raster / SVG). */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** HEIC / TIFF / ICO → canvas; other formats use `<img>` decode. */
export async function resolveImageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const ext = extOf(file.name);
  if (ext === "heic" || ext === "heif") {
    const png = await heicToPngBlob(file);
    return fileToCanvas(new File([png], extOf(file.name) ? file.name.replace(/\.[^.]+$/, ".png") : "photo.png", { type: "image/png" }));
  }
  if (ext === "tif" || ext === "tiff") {
    return tiffToCanvas(file);
  }
  if (ext === "ico") {
    const pngBlob = await icoToPngBlob(file);
    return fileToCanvas(new File([pngBlob], "icon.png", { type: "image/png" }));
  }
  return fileToCanvas(file);
}

export async function applyImageBatch(
  source: HTMLCanvasElement,
  opts: ImageBatchOptions,
  onProgress?: (pct: number) => void
): Promise<HTMLCanvasElement> {
  let canvas = source;

  if (opts.cropPct) {
    const { x, y, w, h } = opts.cropPct;
    const sx = clamp(x, 0, 1) * canvas.width;
    const sy = clamp(y, 0, 1) * canvas.height;
    const sw = clamp(w, 0.01, 1) * canvas.width;
    const sh = clamp(h, 0.01, 1) * canvas.height;
    const next = document.createElement("canvas");
    next.width = Math.round(sw);
    next.height = Math.round(sh);
    const ctx = next.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, next.width, next.height);
    canvas = next;
    onProgress?.(25);
  }

  let tw = canvas.width;
  let th = canvas.height;
  if (opts.maxWidth || opts.maxHeight) {
    const mw = opts.maxWidth && opts.maxWidth > 0 ? opts.maxWidth : tw;
    const mh = opts.maxHeight && opts.maxHeight > 0 ? opts.maxHeight : th;
    const scale = Math.min(mw / tw, mh / th, 1);
    if (scale < 1) {
      tw = Math.round(tw * scale);
      th = Math.round(th * scale);
      const Pica = (await import("pica")).default;
      const resizer = Pica();
      const src = canvas;
      const dst = document.createElement("canvas");
      dst.width = tw;
      dst.height = th;
      await resizer.resize(src, dst, { quality: 3 });
      canvas = dst;
      onProgress?.(60);
    }
  }

  onProgress?.(100);
  return canvas;
}

export async function canvasToOutputBlob(
  canvas: HTMLCanvasElement,
  outputExt: string,
  quality: number
): Promise<Blob> {
  const ext = outputExt.toLowerCase();
  if (ext === "png") {
    const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!b) throw new Error("PNG export failed");
    return b;
  }
  if (ext === "webp") {
    const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (!b) throw new Error("WebP export failed");
    return b;
  }
  if (ext === "jpg" || ext === "jpeg") {
    const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!b) throw new Error("JPEG export failed");
    return b;
  }
  throw new Error(`canvasToOutputBlob: unsupported ${outputExt}`);
}

export async function canvasToIcoOutput(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToIcoBlob(canvas);
}
