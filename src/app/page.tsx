"use client";

import { AdShell } from "@/components/AdShell";
import { PaymentModal } from "@/components/PaymentModal";
import {
  downloadBlob,
  mimeForOutput,
  pickSaveDirectory,
  saveBlobToDirectory,
  supportsDirectoryPicker,
} from "@/lib/download";
import { buildAcceptAttribute } from "@/lib/accept-string";
import {
  ALL_OFFICE_INPUTS,
  AUDIO_INPUTS,
  defaultOutputExtension,
  detectOfficeSubtype,
  IMAGE_INPUTS,
  outputGroupsForKind,
  PDF_INPUTS,
  type MediaKind,
  type OfficeSubtype,
  VIDEO_INPUTS,
} from "@/lib/format-registry";
import {
  consumeConversions,
  getMaxFileBytesForPlan,
  getPlan,
  setPlan as savePlanToStorage,
  type Plan,
} from "@/lib/membership";
import {
  Download,
  FileAudio2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Layers,
  Loader2,
  UploadCloud,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PdfOperation = "convert" | "split" | "extract-images" | "to-docx";
type ConvertStatus = "queued" | "converting" | "success" | "error";
type VideoQualityPreset = "fast" | "standard" | "high";
type PaidTier = "pro" | "max";

const PDF_TOOL_OPTIONS: { value: PdfOperation; label: string }[] = [
  { value: "convert", label: "Keep / convert to PDF" },
  { value: "split", label: "Split pages → ZIP (one PDF per page)" },
  { value: "extract-images", label: "Extract pages → ZIP (PNG screenshots)" },
  { value: "to-docx", label: "Rebuild as Word (.docx)" },
];

function pdfToolOutputExt(op: PdfOperation): string {
  if (op === "split" || op === "extract-images") return "zip";
  if (op === "to-docx") return "docx";
  return "pdf";
}
type WorkerMessage =
  | { type: "ready" }
  | { type: "progress"; id: string; progress: number }
  | { type: "done"; id: string; outputBuffer: ArrayBuffer }
  | { type: "error"; id?: string; message: string };

type Item = {
  id: string;
  file: File;
  kind: MediaKind;
  /** Target extension or container (e.g. zip, html, docx). */
  outputExt: string;
  officeSubtype?: OfficeSubtype;
  pdfOperation?: PdfOperation;
  status: ConvertStatus;
  progress: number;
  previewUrl?: string;
  convertedBlob?: Blob;
  error?: string;
};

const toId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i + 1).toLowerCase() : "";
};
const renameExt = (name: string, ext: string) => {
  const i = name.lastIndexOf(".");
  const base = i > 0 ? name.slice(0, i) : name;
  return `${base}.${ext}`;
};

/** Default JPEG/WebP quality when encoding images in-browser (no batch UI). */
const DEFAULT_IMAGE_ENCODE_QUALITY = 0.92;
const size = (bytes: number) => {
  if (bytes <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  const v = bytes / 1024 ** i;
  return `${v.toFixed(i ? 2 : 0)} ${u[i]}`;
};

async function sniffPdfMagic(file: File): Promise<boolean> {
  const buf = await file.slice(0, 5).arrayBuffer();
  const u = new Uint8Array(buf);
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
}

const detectKindByName = (file: File): MediaKind | null => {
  const ext = extOf(file.name);
  if ((ALL_OFFICE_INPUTS as readonly string[]).includes(ext)) return "office";
  if ((IMAGE_INPUTS as readonly string[]).includes(ext)) return "image";
  if ((AUDIO_INPUTS as readonly string[]).includes(ext)) return "audio";
  if ((VIDEO_INPUTS as readonly string[]).includes(ext)) return "video";
  if ((PDF_INPUTS as readonly string[]).includes(ext)) return "pdf";
  return null;
};

const defaultOutputByFile = (file: File, kind: MediaKind, officeSubtype?: OfficeSubtype) =>
  defaultOutputExtension(extOf(file.name), kind, officeSubtype);

function CircularProgress({ progress }: { progress: number }) {
  const p = Math.min(100, Math.max(0, progress));
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (p / 100) * circumference;
  return (
    <div className="relative mx-auto mt-3 flex h-24 w-24 items-center justify-center">
      <svg className="-rotate-90 transform" width="96" height="96" viewBox="0 0 96 96">
        <circle
          className="text-slate-700"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r="40"
          cx="48"
          cy="48"
        />
        <circle
          className="text-sky-400 transition-[stroke-dashoffset] duration-300"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="40"
          cx="48"
          cy="48"
        />
      </svg>
      <span className="absolute text-sm font-semibold text-white">{p}%</span>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const workerRef = useRef<Worker | null>(null);
  const resolverRef = useRef<Map<string, { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }>>(
    new Map()
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const batchCtxRef = useRef<{ total: number; index: number } | null>(null);
  const [videoPreset, setVideoPreset] = useState<VideoQualityPreset>("fast");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState<PaidTier>("pro");
  const inputRef = useRef<HTMLInputElement>(null);
  const [outputDirHandle, setOutputDirHandle] = useState<{
    name?: string;
    getFileHandle: (
      name: string,
      options?: { create?: boolean }
    ) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  } | null>(null);
  const canPickDirectory = supportsDirectoryPicker();

  const activePlan: Plan = useMemo(() => {
    if (sessionStatus === "authenticated" && session?.user?.effectivePlan) {
      return session.user.effectivePlan;
    }
    return getPlan();
  }, [session?.user?.effectivePlan, sessionStatus]);

  const refreshMembershipUi = useCallback(() => {
    void updateSession();
  }, [updateSession]);

  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/ffmpegWorker.ts", import.meta.url), {
      type: "module",
    });
    const worker = workerRef.current;
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        setWorkerReady(true);
        setEngineLoading(false);
        return;
      }
      if (msg.type === "progress") {
        setItems((prev) =>
          prev.map((x) => (x.id === msg.id ? { ...x, progress: msg.progress, status: "converting" } : x))
        );
        const ctx = batchCtxRef.current;
        if (ctx) {
          setBatchProgress(Math.min(100, ((ctx.index + msg.progress / 100) / ctx.total) * 100));
        }
        return;
      }
      if (msg.type === "done") {
        resolverRef.current.get(msg.id)?.resolve(msg.outputBuffer);
        return;
      }
      if (msg.type === "error") {
        if (msg.id) {
          resolverRef.current.get(msg.id)?.reject(new Error(msg.message));
          return;
        }
        setEngineLoading(false);
      }
    };
    worker.addEventListener("message", onMessage);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      items.forEach((x) => {
        if (x.previewUrl) URL.revokeObjectURL(x.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureWorker = async () => {
    if (workerReady) return;
    if (!workerRef.current) throw new Error("FFmpeg worker failed to initialize");
    setEngineLoading(true);
    workerRef.current.postMessage({ type: "init" });
  };

  const maxBytes = getMaxFileBytesForPlan(activePlan);
  const isFree = activePlan === "free";
  const isPro = activePlan === "pro";
  const isMax = activePlan === "max";
  const isPaid = isPro || isMax;
  const effectiveVideoPreset: VideoQualityPreset = isMax ? "high" : isPro ? videoPreset : "fast";

  const totalDone = items.filter((x) => x.status === "success").length;
  const pdfItems = items.filter((x) => x.kind === "pdf");

  const buildItem = async (file: File): Promise<Item | null> => {
    const limit = maxBytes;
    if (file.size > limit) {
      window.alert(
        `"${file.name}" exceeds your plan limit (${size(limit)}). Upgrade to Pro/Max or use a smaller file.`
      );
      return null;
    }

    let kind = detectKindByName(file);
    if (!kind && (await sniffPdfMagic(file))) {
      kind = "pdf";
    }
    if (!kind) {
      window.alert(`Unsupported or unknown format: ${file.name}`);
      return null;
    }

    const ext = extOf(file.name);
    let officeSubtype: OfficeSubtype | undefined;
    if (kind === "office") {
      officeSubtype = detectOfficeSubtype(ext) ?? "word";
    }

    if (kind === "pdf") {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const raw = await file.arrayBuffer();
        await PDFDocument.load(raw);
      } catch {
        window.alert(`PDF is invalid or corrupted: ${file.name}`);
        return null;
      }
    }

    const previewUrl =
      kind === "image" || kind === "pdf" ? URL.createObjectURL(file) : undefined;

    const pdfOperation: PdfOperation | undefined = kind === "pdf" ? "convert" : undefined;

    return {
      id: toId(),
      file,
      kind,
      officeSubtype,
      pdfOperation,
      outputExt: defaultOutputByFile(file, kind, officeSubtype),
      status: "queued",
      progress: 0,
      previewUrl,
    };
  };

  const addFiles = async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const next: Item[] = [];
    for (const file of list) {
      const item = await buildItem(file);
      if (item) next.push(item);
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = "";
  };

  const convertWithWorker = (
    item: Item,
    outputExt: string,
    fileOverride?: File
  ): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker is not available"));
        return;
      }
      resolverRef.current.set(item.id, { resolve, reject });
      const src = fileOverride ?? item.file;
      src
        .arrayBuffer()
        .then((buf) => {
          workerRef.current?.postMessage(
            {
              type: "convert",
              payload: {
                id: item.id,
                fileName: src.name,
                outputExt,
                fileBuffer: buf,
                kind:
                  item.kind === "audio"
                    ? "audio"
                    : item.kind === "video"
                      ? "video"
                      : item.kind === "pdf"
                        ? "pdf"
                        : "image",
                videoPreset: effectiveVideoPreset,
              },
            },
            [buf]
          );
        })
        .catch((err) => reject(err instanceof Error ? err : new Error("Failed to read file")));
    });

  const imageToPdf = async (file: File): Promise<Blob> => {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = extOf(file.name);
    const useRasterPng = ext === "png" || ext === "apng";
    const image = useRasterPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    const out = await pdf.save();
    const outBytes = new Uint8Array(out);
    return new Blob([outBytes.buffer], { type: "application/pdf" });
  };

  const mergePdfs = async () => {
    if (!isPaid) {
      window.alert("Merging multiple PDFs is a Pro feature. Please upgrade.");
      return;
    }
    const pdfs = items.filter((x) => x.kind === "pdf");
    if (pdfs.length < 2) {
      window.alert("Add at least two PDF files before merging.");
      return;
    }
    setMergeBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      for (const entry of pdfs) {
        const bytes = await entry.file.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      }
      const out = await merged.save();
      const blob = new Blob([new Uint8Array(out)], { type: "application/pdf" });
      downloadBlob(blob, `merged-${Date.now()}.pdf`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeBusy(false);
    }
  };

  /** Save to chosen folder or trigger browser download (same path as manual Download). */
  const deliverFileBlob = async (item: Item, blob: Blob, outputExt: string) => {
    const mime = mimeForOutput(item.kind, outputExt);
    const finalBlob =
      blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([blob], { type: mime });
    const filename = renameExt(item.file.name, outputExt);
    if (outputDirHandle) {
      try {
        await saveBlobToDirectory(finalBlob, filename, outputDirHandle);
        return;
      } catch (e) {
        window.alert(
          e instanceof Error
            ? `Could not write to selected folder (${e.message}). Falling back to browser download.`
            : "Could not write to selected folder. Falling back to browser download."
        );
      }
    }
    downloadBlob(finalBlob, filename);
  };

  const triggerDownload = async (item: Item) => {
    if (!item.convertedBlob) return;
    await deliverFileBlob(item, item.convertedBlob, item.outputExt);
  };

  const runAll = async () => {
    let queue = items.filter((x) => x.status === "queued");
    if (!queue.length) return;

    if (isFree && queue.length > 5) {
      promptUpgradeToPricing();
      return;
    }
    if (isPro && queue.length > 10) {
      window.alert(
        "Pro can process up to 10 files per run — using the first 10. Upgrade to Max for unlimited batch size."
      );
      queue = queue.slice(0, 10);
    }

    setIsConverting(true);
    setBatchProgress(0);
    batchCtxRef.current = { total: queue.length, index: 0 };
    await ensureWorker();

    for (let qi = 0; qi < queue.length; qi++) {
      const item = queue[qi];
      batchCtxRef.current = { total: queue.length, index: qi };

      const effectiveOutputExt = item.outputExt;
      const pdfOp = item.pdfOperation ?? "convert";

      const bumpItemProgress = (pct: number) => {
        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, progress: pct, status: "converting" } : x))
        );
        setBatchProgress(Math.min(100, ((qi + pct / 100) / queue.length) * 100));
      };

      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, outputExt: effectiveOutputExt, status: "converting", progress: 0 }
            : x
        )
      );

      try {
        let blob: Blob;

        if (item.kind === "office") {
          const office = await import("@/lib/convert/office");
          if (item.officeSubtype === "excel") {
            blob = await office.convertXlsx(
              item.file,
              effectiveOutputExt as "html" | "pdf" | "csv",
              bumpItemProgress
            );
          } else if (item.officeSubtype === "text") {
            blob = await office.convertPlainText(
              item.file,
              effectiveOutputExt as "html" | "pdf",
              bumpItemProgress
            );
          } else {
            blob = await office.convertDocx(
              item.file,
              effectiveOutputExt as "html" | "pdf" | "txt",
              bumpItemProgress
            );
          }
        } else if (item.kind === "pdf") {
          if (pdfOp === "split") {
            const pdfTools = await import("@/lib/convert/pdf-tools");
            blob = await pdfTools.splitPdfToZip(item.file, bumpItemProgress);
          } else if (pdfOp === "extract-images") {
            const pdfTools = await import("@/lib/convert/pdf-tools");
            blob = await pdfTools.extractPdfPagesAsImagesZip(item.file, bumpItemProgress);
          } else if (pdfOp === "to-docx") {
            const pdfTools = await import("@/lib/convert/pdf-tools");
            blob = await pdfTools.pdfToWordLikeDocx(item.file, bumpItemProgress);
          } else {
            blob = new Blob([await item.file.arrayBuffer()], { type: "application/pdf" });
          }
        } else if (item.kind === "image") {
          const ip = await import("@/lib/convert/image-process");
          const canvas = await ip.resolveImageFileToCanvas(item.file);

          if (effectiveOutputExt === "pdf") {
            const pngFile = new File([await ip.canvasToOutputBlob(canvas, "png", 1)], "page.png", {
              type: "image/png",
            });
            blob = await imageToPdf(pngFile);
          } else if (effectiveOutputExt === "ico") {
            const { canvasToIcoBlob } = await import("@/lib/convert/image-decode");
            blob = await canvasToIcoBlob(canvas);
          } else if (
            effectiveOutputExt === "jpg" ||
            effectiveOutputExt === "png" ||
            effectiveOutputExt === "webp"
          ) {
            blob = await ip.canvasToOutputBlob(
              canvas,
              effectiveOutputExt,
              DEFAULT_IMAGE_ENCODE_QUALITY
            );
          } else {
            const pngFile = new File([await ip.canvasToOutputBlob(canvas, "png", 1)], "frame.png", {
              type: "image/png",
            });
            const outputBuffer = await convertWithWorker(item, effectiveOutputExt, pngFile);
            blob = new Blob([outputBuffer], {
              type: mimeForOutput("image", effectiveOutputExt),
            });
          }
        } else {
          const outputBuffer = await convertWithWorker(item, effectiveOutputExt);
          blob = new Blob([outputBuffer], {
            type: mimeForOutput(item.kind, effectiveOutputExt),
          });
        }

        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  outputExt: effectiveOutputExt,
                  convertedBlob: blob,
                  progress: 100,
                  status: "success",
                }
              : x
          )
        );
        setBatchProgress(((qi + 1) / queue.length) * 100);
        if (isFree) {
          consumeConversions(1);
          refreshMembershipUi();
        }

        // Auto-deliver so users get files without an extra click (stagger avoids multi-download blocks).
        await new Promise((r) => setTimeout(r, qi * 280));
        await deliverFileBlob(item, blob, effectiveOutputExt);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Conversion failed";
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: "error", error: msg } : x)));
      } finally {
        resolverRef.current.delete(item.id);
      }
    }

    batchCtxRef.current = null;
    setBatchProgress(100);
    setIsConverting(false);
  };

  const zipAll = async () => {
    const done = items.filter((x) => x.convertedBlob);
    if (!done.length) return;
    setIsZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      done.forEach((x) => {
        const mime = mimeForOutput(x.kind, x.outputExt);
        const blob =
          x.convertedBlob!.type && x.convertedBlob!.type !== "application/octet-stream"
            ? x.convertedBlob!
            : new Blob([x.convertedBlob!], { type: mime });
        zip.file(renameExt(x.file.name, x.outputExt), blob);
      });
      const zipped = await zip.generateAsync({ type: "blob" });
      if (outputDirHandle) {
        try {
          await saveBlobToDirectory(zipped, "all-converted-files.zip", outputDirHandle);
          return;
        } catch (e) {
          window.alert(
            e instanceof Error
              ? `Could not write ZIP to selected folder (${e.message}). Falling back to browser download.`
              : "Could not write ZIP to selected folder. Falling back to browser download."
          );
        }
      }
      downloadBlob(zipped, "all-converted-files.zip");
    } finally {
      setIsZipping(false);
    }
  };

  const statusLabel = (s: ConvertStatus) => {
    if (s === "queued") return "Queued";
    if (s === "converting") return "Converting";
    if (s === "success") return "Done";
    return "Failed";
  };

  const promptUpgradeToPricing = () => {
    const shouldGo = window.confirm(
      "Free plan supports up to 5 files per batch. Go to Pricing to upgrade?"
    );
    if (shouldGo) {
      router.push("/pricing");
    }
  };

  return (
    <>
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        selectedTier={selectedUpgradeTier}
        onProUnlocked={async (tier) => {
          await updateSession();
          if (sessionStatus !== "authenticated") {
            savePlanToStorage(tier);
          }
          setPaymentOpen(false);
        }}
      />

      <AdShell>
      <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">
            Conversions today: <strong className="text-white">Unlimited</strong>
          </span>
          <span className="hidden text-slate-400 sm:inline">|</span>
          <span className="text-slate-300">
            Max file size: <strong className="text-white">{size(maxBytes)}</strong>
            {isMax ? " · Max" : isPro ? " · Pro" : " · Free"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessionStatus === "authenticated" ? (
            <>
              <span className="hidden text-xs text-slate-400 sm:inline">
                {session?.user?.email}
              </span>
              {session?.user?.planExpiresAt && activePlan !== "free" ? (
                <span className="text-xs text-slate-400">
                  Until{" "}
                  {new Date(session.user.planExpiresAt).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/" })}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
              >
                Register
              </Link>
            </>
          )}
          <Link
            href="/pricing"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Pricing
          </Link>
          {!isPaid ? (
            <button
              type="button"
              onClick={() => {
                setSelectedUpgradeTier("pro");
                setPaymentOpen(true);
              }}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Upgrade to Pro
            </button>
          ) : !isMax ? (
            <button
              type="button"
              onClick={() => {
                setSelectedUpgradeTier("max");
                setPaymentOpen(true);
              }}
              className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400"
            >
              Upgrade to Max
            </button>
          ) : (
            <span className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300">
              Max unlocked
            </span>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e1423] to-[#090d17] p-8 shadow-2xl shadow-black/30">
          <div className="mb-8 flex items-center gap-3 text-sky-300">
            <Zap className="h-5 w-5" />
            <span className="text-sm uppercase tracking-[0.2em] text-sky-200/80 sm:tracking-[0.24em]">
              Goldfish Format Converter
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Local media converter</h1>
          <p className="mt-3 text-slate-300">
            Everything runs in your browser — your files never upload to our servers.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">Queue</p>
              <p className="mt-1 text-2xl font-semibold">{items.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">Done</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">{totalDone}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">Engine</p>
              <p className="mt-1 text-sm text-slate-200">
                {workerReady ? "FFmpeg worker ready (SharedArrayBuffer)" : "Loading…"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-100">
              Formats detected automatically — pick output format on each card
            </div>
            <label className="ml-auto flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              Video quality
              <select
                value={isMax ? "high" : isPro ? videoPreset : "fast"}
                onChange={(e) => setVideoPreset(e.target.value as VideoQualityPreset)}
                disabled={!isPaid || isMax}
                className="rounded-md border border-white/20 bg-[#0c111d] px-2 py-1 outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="fast">Fast</option>
                <option value="standard">Standard (Pro)</option>
                <option value="high">High quality (Max)</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canPickDirectory ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const handle = await pickSaveDirectory();
                      if (handle) setOutputDirHandle(handle);
                    } catch (e) {
                      window.alert(
                        e instanceof Error ? `Folder selection canceled: ${e.message}` : "Folder selection canceled."
                      );
                    }
                  }}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                >
                  Choose output folder
                </button>
                {outputDirHandle ? (
                  <button
                    type="button"
                    onClick={() => setOutputDirHandle(null)}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
                  >
                    Clear folder
                  </button>
                ) : null}
                <span className="text-xs text-slate-500">
                  {outputDirHandle
                    ? `Saving downloads to: ${outputDirHandle.name ?? "selected folder"}`
                    : "No folder selected: browser default download location will be used."}
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-500">
                Custom output folder is not supported by this browser. Downloads will use browser default location.
              </span>
            )}
          </div>
          {!isPaid ? (
            <p className="mt-2 text-xs text-slate-500">
              Free: up to 100MB per file, batch up to 5. Visit Pricing to unlock more.
            </p>
          ) : isPro ? (
            <p className="mt-2 text-xs text-slate-500">Pro: up to 500MB per file, batch up to 10.</p>
          ) : isMax ? (
            <p className="mt-2 text-xs text-slate-500">Max: highest priority and no practical size limit.</p>
          ) : null}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
            }}
            className={`mt-8 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 transition ${
              isDragging
                ? "animate-drag-glow border-sky-400 bg-sky-500/10"
                : "border-slate-500/40 bg-slate-900/40"
            }`}
          >
            <UploadCloud className="h-12 w-12 text-sky-300" />
            <p className="text-lg font-medium">Drag & drop or click to add files</p>
            <p className="text-sm text-slate-400">
              Images, audio, video, PDFs, Office, CSV, and plain text — pick the output format on each card.
            </p>
          </button>
          <input ref={inputRef} type="file" accept={buildAcceptAttribute()} multiple onChange={onInput} className="hidden" />

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={isConverting || !items.some((x) => x.status === "queued")}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {isConverting || engineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Convert all
            </button>
            <button
              type="button"
              onClick={() => void zipAll()}
              disabled={!items.some((x) => x.convertedBlob) || isZipping}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isZipping ? "Zipping…" : "Download all as ZIP"}
            </button>
            <button
              type="button"
              onClick={() => void mergePdfs()}
              disabled={mergeBusy || pdfItems.length < 2 || !isPaid}
              title={!isPaid ? "Upgrade to Pro to merge PDFs" : undefined}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-400/50 bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-100 disabled:opacity-50"
            >
              {mergeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Merge PDFs (Pro)
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            After conversion, files download automatically (or save to your chosen folder — no download bar in that case).
          </p>

          {isConverting ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <div className="mb-2 flex justify-between text-xs text-emerald-100/90">
                <span>Overall batch progress</span>
                <span>{Math.round(batchProgress)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, batchProgress)}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-[#0c111d] p-4">
              <div className="mb-3 flex items-center justify-between gap-2 text-slate-300">
                <div className="flex items-center gap-2">
                  {item.kind === "image" ? (
                    <FileImage className="h-4 w-4 shrink-0" />
                  ) : item.kind === "audio" ? (
                    <FileAudio2 className="h-4 w-4 shrink-0" />
                  ) : item.kind === "video" ? (
                    <FileVideo className="h-4 w-4 shrink-0" />
                  ) : item.kind === "office" ? (
                    item.officeSubtype === "excel" ? (
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-300" />
                    ) : item.officeSubtype === "text" ? (
                      <FileText className="h-4 w-4 shrink-0 text-amber-300" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-sky-300" />
                    )
                  ) : (
                    <FileText className="h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 truncate text-sm">{item.file.name}</span>
                </div>
                <span className="shrink-0 text-xs">{statusLabel(item.status)}</span>
              </div>
              {item.kind === "image" && item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt={item.file.name} className="h-40 w-full rounded-xl object-cover" />
              ) : item.kind === "pdf" && item.previewUrl ? (
                <iframe
                  title={item.file.name}
                  src={item.previewUrl}
                  className="h-40 w-full rounded-xl border border-white/10 bg-white"
                />
              ) : item.kind === "office" ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-white/10 text-slate-400">
                  <span className="text-lg font-medium text-slate-300">
                    {item.officeSubtype === "excel"
                      ? "Spreadsheet"
                      : item.officeSubtype === "text"
                        ? "Plain text / Markdown"
                        : "Word"}
                  </span>
                  <span className="mt-1 text-xs">Processed locally in your browser</span>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 text-slate-400">
                  {item.kind.toUpperCase()}
                </div>
              )}
              <div className="mt-3 text-sm text-slate-300">
                <p>In: {extOf(item.file.name).toUpperCase() || (item.kind === "pdf" ? "PDF" : "UNKNOWN")}</p>
                <p>Original: {size(item.file.size)}</p>
                <p>Output: {item.convertedBlob ? size(item.convertedBlob.size) : "—"}</p>
                {item.error ? <p className="text-red-300">{item.error}</p> : null}
              </div>
              {item.kind === "pdf" ? (
                <label className="mt-3 flex flex-col gap-2 rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm">
                  <span className="text-slate-200">PDF processing</span>
                  <select
                    value={item.pdfOperation ?? "convert"}
                    onChange={(e) => {
                      const op = e.target.value as PdfOperation;
                      const nextExt = pdfToolOutputExt(op);
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === item.id
                            ? {
                                ...x,
                                pdfOperation: op,
                                outputExt: nextExt,
                                status: x.status === "converting" ? x.status : "queued",
                                progress: x.status === "converting" ? x.progress : 0,
                                convertedBlob: undefined,
                                error: undefined,
                              }
                            : x
                        )
                      );
                    }}
                    disabled={item.status === "converting"}
                    className="rounded-md border border-white/20 bg-[#0c111d] px-2 py-1 text-xs outline-none disabled:opacity-60 sm:text-sm"
                  >
                    {PDF_TOOL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Download extension: <strong className="text-slate-300">{item.outputExt}</strong>
                  </p>
                </label>
              ) : (
                <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm">
                  <span className="text-slate-200">Output format</span>
                  <select
                    value={item.outputExt}
                    onChange={(e) => {
                      const value = e.target.value;
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === item.id
                            ? {
                                ...x,
                                outputExt: value,
                                status: x.status === "converting" ? x.status : "queued",
                                progress: x.status === "converting" ? x.progress : 0,
                                convertedBlob: undefined,
                                error: undefined,
                              }
                            : x
                        )
                      );
                    }}
                    disabled={item.status === "converting"}
                    className="max-w-[min(100%,220px)] rounded-md border border-white/20 bg-[#0c111d] px-2 py-1 text-xs outline-none disabled:opacity-60 sm:max-w-none sm:text-sm"
                  >
                    {outputGroupsForKind(item.kind, item.officeSubtype).map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              {item.status === "converting" ? (
                <div>
                  <CircularProgress progress={item.progress} />
                  <p className="mt-1 text-center text-xs text-slate-500">Progress</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void triggerDownload(item)}
                disabled={!item.convertedBlob}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            </article>
          ))}
        </section>
      </main>
      </AdShell>
    </>
  );
}
