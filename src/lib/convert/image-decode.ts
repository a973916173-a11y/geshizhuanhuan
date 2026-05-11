/**
 * Decode exotic image formats to PNG blob for further processing.
 * Heavy libs are dynamically imported when needed.
 */

export async function heicToPngBlob(file: File): Promise<Blob> {
  const mod = await import("heic2any");
  const heic2any = mod.default ?? mod;
  const result = await heic2any({ blob: file, toType: "image/png" });
  const arr = Array.isArray(result) ? result[0] : result;
  return arr as Blob;
}

export async function tiffToCanvas(file: File): Promise<HTMLCanvasElement> {
  const buf = await file.arrayBuffer();
  const mod = await import("utif");
  const utif = mod as unknown as {
    decode: (b: ArrayBuffer) => Record<string, unknown>[];
    decodeImage: (b: ArrayBuffer, ifd: Record<string, unknown>) => void;
    toRGBA8: (ifd: Record<string, unknown>) => Uint8Array;
  };
  const ifds = utif.decode(buf);
  if (!ifds.length) throw new Error("Invalid TIFF");
  utif.decodeImage(buf, ifds[0]);
  const rgba = utif.toRGBA8(ifds[0]);
  const ifd = ifds[0] as { width: number; height: number };
  const w = ifd.width;
  const h = ifd.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export async function icoToPngBlob(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  const { decodeIco } = await import("icojs");
  const images = await decodeIco(buf, "image/png");
  if (!images.length) throw new Error("Invalid ICO");
  const best = images.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return new Blob([best.buffer], { type: "image/png" });
}

/** Encode canvas pixels to ICO via icojs (PNG-backed entry). */
export async function canvasToIcoBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) void b.arrayBuffer().then(resolve);
        else reject(new Error("PNG export failed"));
      },
      "image/png"
    );
  });
  const { encodeIco } = await import("icojs");
  const icoAb = await encodeIco([{ buffer: pngBuf }]);
  return new Blob([icoAb], { type: "image/x-icon" });
}
