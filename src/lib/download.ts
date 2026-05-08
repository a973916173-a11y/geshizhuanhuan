/** MIME for stable browser download behavior (especially video). */
export function mimeForOutput(kind: string, ext: string): string {
  const e = ext.toLowerCase();
  if (kind === "video") {
    if (e === "mp4") return "video/mp4";
    if (e === "webm") return "video/webm";
    if (e === "mov") return "video/quicktime";
    return "application/octet-stream";
  }
  if (kind === "audio") {
    if (e === "mp3") return "audio/mpeg";
    if (e === "wav") return "audio/wav";
    if (e === "aac") return "audio/aac";
    if (e === "ogg") return "audio/ogg";
    return "application/octet-stream";
  }
  if (kind === "image") {
    if (e === "jpg" || e === "jpeg") return "image/jpeg";
    if (e === "png") return "image/png";
    if (e === "webp") return "image/webp";
    if (e === "gif") return "image/gif";
    if (e === "bmp") return "image/bmp";
    if (e === "avif") return "image/avif";
    if (e === "tiff") return "image/tiff";
    return "application/octet-stream";
  }
  if (kind === "pdf") return "application/pdf";
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
