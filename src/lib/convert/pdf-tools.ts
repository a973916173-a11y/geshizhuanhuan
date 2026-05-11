/** Browser-side PDF utilities — loaded only when user picks PDF tools (dynamic import). */

export async function splitPdfToZip(file: File, onProgress: (pct: number) => void): Promise<Blob> {
  const [{ PDFDocument }, jszipMod] = await Promise.all([import("pdf-lib"), import("jszip")]);
  const JSZip = jszipMod.default;
  const raw = await file.arrayBuffer();
  const src = await PDFDocument.load(raw);
  const zip = new JSZip();
  const n = src.getPageCount();
  for (let i = 0; i < n; i++) {
    onProgress(Math.round(((i + 0.5) / n) * 100));
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(src, [i]);
    out.addPage(copied);
    const bytes = await out.save();
    zip.file(`page-${String(i + 1).padStart(4, "0")}.pdf`, new Uint8Array(bytes));
  }
  onProgress(100);
  return zip.generateAsync({ type: "blob" });
}

const PDFJS_VER = "5.7.284";
const PDF_WORKER_SRC = `https://unpkg.com/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.mjs`;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjs;
}

export async function extractPdfPagesAsImagesZip(
  file: File,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const pdfjs = await loadPdfJs();
  const JSZip = (await import("jszip")).default;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const zip = new JSZip();
  const n = pdf.numPages;
  for (let i = 1; i <= n; i++) {
    onProgress(Math.round(((i - 0.5) / n) * 100));
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    const task = page.render({ canvas, canvasContext: ctx, viewport });
    await task.promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) zip.file(`page-${String(i).padStart(4, "0")}.png`, blob);
  }
  onProgress(100);
  return zip.generateAsync({ type: "blob" });
}

export async function pdfToWordLikeDocx(file: File, onProgress: (pct: number) => void): Promise<Blob> {
  const pdfjs = await loadPdfJs();
  const docx = await import("docx");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const children: InstanceType<typeof docx.Paragraph>[] = [];
  const n = pdf.numPages;

  for (let i = 1; i <= n; i++) {
    onProgress(Math.round(((i - 1) / n) * 45));
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const parts = textContent.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean);
    const body = parts.join(" ").trim() || `(Page ${i} — no extractable text)`;
    children.push(
      new docx.Paragraph({
        children: [new docx.TextRun({ text: `Page ${i}`, bold: true, size: 28 })],
      })
    );
    children.push(new docx.Paragraph({ text: body }));

    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      await task.promise;
      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82)
      );
      if (jpegBlob) {
        const jpegBuf = await jpegBlob.arrayBuffer();
        const w = 480;
        const h = Math.round((480 * canvas.height) / canvas.width);
        children.push(
          new docx.Paragraph({
            children: [
              new docx.ImageRun({
                type: "jpg",
                data: jpegBuf,
                transformation: { width: w, height: h },
              }),
            ],
          })
        );
      }
    }
    children.push(new docx.Paragraph({ text: "" }));
    onProgress(Math.round(45 + (i / n) * 55));
  }

  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  const blob = await docx.Packer.toBlob(doc);
  onProgress(100);
  return blob;
}
