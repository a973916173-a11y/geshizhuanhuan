/** Word / Excel / plain text — mammoth, xlsx, jspdf loaded on demand. */

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i + 1).toLowerCase() : "";
}

async function canvasToPagedPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const srcWidth = canvas.width;
  const srcHeight = canvas.height;
  const scale = pageWidth / srcWidth;
  const sliceHeightPx = pageHeight / scale;
  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) throw new Error("Canvas unsupported");
  let y = 0;
  let first = true;
  while (y < srcHeight) {
    const h = Math.min(sliceHeightPx, srcHeight - y);
    pageCanvas.width = srcWidth;
    pageCanvas.height = h;
    pageCtx.drawImage(canvas, 0, y, srcWidth, h, 0, 0, srcWidth, h);
    const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
    const slicePdfHeight = (h * pageWidth) / srcWidth;
    if (!first) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, slicePdfHeight);
    first = false;
    y += h;
  }
  return pdf.output("blob") as Blob;
}

export async function convertDocx(
  file: File,
  output: "html" | "pdf" | "txt",
  onProgress: (pct: number) => void
): Promise<Blob> {
  const mammoth = await import("mammoth");
  onProgress(10);
  const arrayBuffer = await file.arrayBuffer();

  if (output === "txt") {
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    onProgress(100);
    return new Blob([value], { type: "text/plain;charset=utf-8" });
  }

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  onProgress(35);

  if (output === "html") {
    const wrapped = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Document</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;line-height:1.5}</style></head><body>${html}</body></html>`;
    onProgress(100);
    return new Blob([wrapped], { type: "text/html;charset=utf-8" });
  }

  const html2canvas = (await import("html2canvas")).default;
  onProgress(45);
  const div = document.createElement("div");
  div.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;padding:24px;background:#fff;color:#111;font-family:system-ui,sans-serif;line-height:1.45;";
  div.innerHTML = html;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
    });
    onProgress(72);
    const blob = await canvasToPagedPdfBlob(canvas);
    onProgress(100);
    return blob;
  } finally {
    document.body.removeChild(div);
  }
}

export async function convertXlsx(
  file: File,
  output: "html" | "pdf" | "csv",
  onProgress: (pct: number) => void
): Promise<Blob> {
  const XLSX = await import("xlsx");
  onProgress(10);
  const buf = await file.arrayBuffer();
  const ext = extOf(file.name);
  let wb;
  if (ext === "csv") {
    const text = new TextDecoder().decode(new Uint8Array(buf));
    wb = XLSX.read(text, { type: "string" });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (output === "csv") {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    onProgress(100);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }

  const htmlTable = XLSX.utils.sheet_to_html(sheet);
  onProgress(35);

  const wrappedHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${sheetName}</title><style>table{border-collapse:collapse;width:100%;font-family:system-ui,sans-serif;font-size:13px}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}tr:nth-child(even){background:#f7f7f8}</style></head><body><h2 style="font-family:system-ui">${sheetName}</h2>${htmlTable}</body></html>`;

  if (output === "html") {
    onProgress(100);
    return new Blob([wrappedHtml], { type: "text/html;charset=utf-8" });
  }

  const html2canvas = (await import("html2canvas")).default;
  onProgress(48);
  const div = document.createElement("div");
  div.style.cssText =
    "position:fixed;left:-12000px;top:0;width:960px;padding:16px;background:#fff;";
  div.innerHTML = wrappedHtml;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
    });
    onProgress(72);
    const blob = await canvasToPagedPdfBlob(canvas);
    onProgress(100);
    return blob;
  } finally {
    document.body.removeChild(div);
  }
}

/** Plain text / Markdown → HTML or paginated PDF (no AI). */
export async function convertPlainText(
  file: File,
  output: "html" | "pdf",
  onProgress: (pct: number) => void
): Promise<Blob> {
  const raw = await file.text();
  onProgress(15);
  const ext = extOf(file.name);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inner =
    ext === "md"
      ? `<article style="font-family:system-ui;line-height:1.6;max-width:720px;margin:0 auto">${raw
          .split("\n")
          .map((line) => `<p>${esc(line) || "&nbsp;"}</p>`)
          .join("")}</article>`
      : `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${esc(raw)}</pre>`;

  if (output === "html") {
    const wrapped = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Document</title></head><body style="padding:24px;background:#fff;color:#111">${inner}</body></html>`;
    onProgress(100);
    return new Blob([wrapped], { type: "text/html;charset=utf-8" });
  }

  const html2canvas = (await import("html2canvas")).default;
  onProgress(35);
  const div = document.createElement("div");
  div.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;padding:24px;background:#fff;color:#111;";
  div.innerHTML = inner;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
    });
    onProgress(72);
    const blob = await canvasToPagedPdfBlob(canvas);
    onProgress(100);
    return blob;
  } finally {
    document.body.removeChild(div);
  }
}
