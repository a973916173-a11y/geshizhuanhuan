/** MIME for stable browser download behavior (especially video). */
export function mimeForOutput(kind: string, ext: string): string {
  const e = ext.toLowerCase();
  if (kind === "office") {
    if (e === "html" || e === "htm") return "text/html;charset=utf-8";
    if (e === "pdf") return "application/pdf";
    if (e === "txt") return "text/plain;charset=utf-8";
    if (e === "csv") return "text/csv;charset=utf-8";
  }
  if (e === "zip") return "application/zip";
  if (e === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (kind === "video") {
    const audioOnly = new Set(["mp3", "wav", "aac", "ogg", "flac", "m4a", "opus", "aiff", "aif"]);
    if (audioOnly.has(e)) {
      if (e === "mp3") return "audio/mpeg";
      if (e === "wav") return "audio/wav";
      if (e === "aac") return "audio/aac";
      if (e === "ogg") return "audio/ogg";
      if (e === "flac") return "audio/flac";
      if (e === "m4a") return "audio/mp4";
      if (e === "opus") return "audio/opus";
      if (e === "aiff" || e === "aif") return "audio/aiff";
    }
    if (e === "mp4") return "video/mp4";
    if (e === "webm") return "video/webm";
    if (e === "mov") return "video/quicktime";
    if (e === "mkv") return "video/x-matroska";
    if (e === "avi") return "video/x-msvideo";
    if (e === "gif") return "image/gif";
    if (e === "flv") return "video/x-flv";
    if (e === "mpeg" || e === "mpg") return "video/mpeg";
    if (e === "m4v") return "video/x-m4v";
    if (e === "ts") return "video/mp2t";
    if (e === "wmv") return "video/x-ms-wmv";
    if (e === "3gp") return "video/3gpp";
    if (e === "ogv") return "video/ogg";
    return "application/octet-stream";
  }
  if (kind === "audio") {
    if (e === "mp3") return "audio/mpeg";
    if (e === "wav") return "audio/wav";
    if (e === "aac") return "audio/aac";
    if (e === "ogg") return "audio/ogg";
    if (e === "flac") return "audio/flac";
    if (e === "m4a") return "audio/mp4";
    if (e === "opus") return "audio/opus";
    if (e === "aiff" || e === "aif") return "audio/aiff";
    return "application/octet-stream";
  }
  if (kind === "image") {
    if (e === "jpg" || e === "jpeg") return "image/jpeg";
    if (e === "png") return "image/png";
    if (e === "webp") return "image/webp";
    if (e === "gif") return "image/gif";
    if (e === "bmp") return "image/bmp";
    if (e === "avif") return "image/avif";
    if (e === "tiff" || e === "tif") return "image/tiff";
    if (e === "ico") return "image/x-icon";
    return "application/octet-stream";
  }
  if (kind === "pdf") {
    if (e === "zip") return "application/zip";
    if (e === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/pdf";
  }
  return "application/octet-stream";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SaveDirectoryHandle = {
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  name?: string;
};

export function supportsDirectoryPicker(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    showDirectoryPicker?: () => Promise<SaveDirectoryHandle>;
  };
  return typeof w.showDirectoryPicker === "function";
}

export async function pickSaveDirectory(): Promise<SaveDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  const w = window as unknown as Window & {
    showDirectoryPicker: () => Promise<SaveDirectoryHandle>;
  };
  return w.showDirectoryPicker();
}

export async function saveBlobToDirectory(
  blob: Blob,
  filename: string,
  directoryHandle: SaveDirectoryHandle
) {
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}
