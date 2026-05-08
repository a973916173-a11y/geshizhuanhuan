"use client";

import { PaymentModal } from "@/components/PaymentModal";
import { downloadBlob, mimeForOutput } from "@/lib/download";
import {
  consumeConversions,
  getMaxFileBytes,
  getPlan,
  getRemainingConversionsToday,
  setPlan as savePlanToStorage,
  type Plan,
} from "@/lib/membership";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import {
  Download,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
  Layers,
  Loader2,
  UploadCloud,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type MediaKind = "image" | "audio" | "video" | "pdf";
type ConvertStatus = "queued" | "converting" | "success" | "error";
type VideoQualityPreset = "fast" | "standard" | "high";
type WorkerMessage =
  | { type: "ready" }
  | { type: "progress"; id: string; progress: number }
  | { type: "done"; id: string; outputBuffer: ArrayBuffer }
  | { type: "error"; id?: string; message: string };

type Item = {
  id: string;
  file: File;
  kind: MediaKind;
  outputExt: string;
  status: ConvertStatus;
  progress: number;
  previewUrl?: string;
  convertedBlob?: Blob;
  error?: string;
};

const IMAGE_INPUTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "svg", "tiff"] as const;
const AUDIO_INPUTS = ["mp3", "wav", "aac", "ogg"] as const;
const VIDEO_INPUTS = ["mp4", "webm", "mov", "mkv"] as const;
const PDF_INPUTS = ["pdf"] as const;

const IMAGE_OUTPUTS = ["jpg", "png", "webp", "avif", "bmp", "gif", "tiff", "pdf"] as const;
const AUDIO_OUTPUTS = ["mp3", "wav", "aac", "ogg"] as const;
const VIDEO_OUTPUTS = ["mp4", "webm", "mov"] as const;
const PDF_OUTPUTS = ["pdf"] as const;

const ACCEPTS = [
  ...IMAGE_INPUTS,
  ...AUDIO_INPUTS,
  ...VIDEO_INPUTS,
  ...PDF_INPUTS,
].map((e) => `.${e}`);

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
  if (IMAGE_INPUTS.includes(ext as (typeof IMAGE_INPUTS)[number])) return "image";
  if (AUDIO_INPUTS.includes(ext as (typeof AUDIO_INPUTS)[number])) return "audio";
  if (VIDEO_INPUTS.includes(ext as (typeof VIDEO_INPUTS)[number])) return "video";
  if (PDF_INPUTS.includes(ext as (typeof PDF_INPUTS)[number])) return "pdf";
  return null;
};

const outputOptionsForKind = (kind: MediaKind) => {
  if (kind === "image") return IMAGE_OUTPUTS;
  if (kind === "audio") return AUDIO_OUTPUTS;
  if (kind === "video") return VIDEO_OUTPUTS;
  return PDF_OUTPUTS;
};

const defaultOutputByFile = (file: File, kind: MediaKind) => {
  const inputExt = extOf(file.name);
  const options = outputOptionsForKind(kind);
  return options.find((opt) => opt !== inputExt) ?? options[0];
};

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
  const [videoPreset, setVideoPreset] = useState<VideoQualityPreset>("fast");
  const [plan, setPlan] = useState<Plan>("guest");
  const [remainingToday, setRemainingToday] = useState(3);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshMembershipUi = useCallback(() => {
    setPlan(getPlan());
    setRemainingToday(getRemainingConversionsToday());
  }, []);

  useEffect(() => {
    // Read persisted plan / daily quota after mount (localStorage is not available on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage on mount
    setPlan(getPlan());
    setRemainingToday(getRemainingConversionsToday());
  }, []);

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
    if (!workerRef.current) throw new Error("FFmpeg Worker 初始化失败");
    setEngineLoading(true);
    workerRef.current.postMessage({ type: "init" });
  };

  const maxBytes = getMaxFileBytes();
  const proUser = plan === "pro";
  const effectiveVideoPreset: VideoQualityPreset = proUser ? videoPreset : "fast";

  const totalDone = items.filter((x) => x.status === "success").length;
  const pdfItems = items.filter((x) => x.kind === "pdf");

  const buildItem = async (file: File): Promise<Item | null> => {
    const limit = getMaxFileBytes();
    if (file.size > limit) {
      window.alert(`文件「${file.name}」超过当前套餐上限（${size(limit)}）。请升级 Pro 或压缩文件。`);
      return null;
    }

    let kind = detectKindByName(file);
    if (!kind && (await sniffPdfMagic(file))) {
      kind = "pdf";
    }
    if (!kind) {
      window.alert(`无法识别格式：${file.name}`);
      return null;
    }

    if (kind === "pdf") {
      try {
        const raw = await file.arrayBuffer();
        await PDFDocument.load(raw);
      } catch {
        window.alert(`PDF 无法解析或已损坏：${file.name}`);
        return null;
      }
    }

    const previewUrl =
      kind === "image" || kind === "pdf" ? URL.createObjectURL(file) : undefined;

    return {
      id: toId(),
      file,
      kind,
      outputExt: defaultOutputByFile(file, kind),
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

  const convertWithWorker = (item: Item, outputExt: string): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker 不可用"));
        return;
      }
      resolverRef.current.set(item.id, { resolve, reject });
      item.file
        .arrayBuffer()
        .then((buf) => {
          workerRef.current?.postMessage(
            {
              type: "convert",
              payload: {
                id: item.id,
                fileName: item.file.name,
                outputExt,
                fileBuffer: buf,
                kind: item.kind,
                videoPreset: effectiveVideoPreset,
              },
            },
            [buf]
          );
        })
        .catch((err) => reject(err instanceof Error ? err : new Error("读取文件失败")));
    });

  const imageToPdf = async (file: File): Promise<Blob> => {
    const pdf = await PDFDocument.create();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = extOf(file.name);
    const image =
      ext === "png" || ext === "apng"
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    const out = await pdf.save();
    const outBytes = new Uint8Array(out);
    return new Blob([outBytes.buffer], { type: "application/pdf" });
  };

  const mergePdfs = async () => {
    if (!proUser) {
      window.alert("PDF 批量合并为 Pro 功能，请先升级。");
      return;
    }
    const pdfs = items.filter((x) => x.kind === "pdf");
    if (pdfs.length < 2) {
      window.alert("请至少上传 2 个 PDF 文件后再合并。");
      return;
    }
    setMergeBusy(true);
    try {
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
      window.alert(e instanceof Error ? e.message : "合并失败");
    } finally {
      setMergeBusy(false);
    }
  };

  const runAll = async () => {
    const queue = items.filter((x) => x.status === "queued");
    if (!queue.length) return;

    if (!proUser) {
      if (queue.length > remainingToday) {
        window.alert(`今日剩余转换次数不足（剩余 ${remainingToday} 次，队列 ${queue.length} 个文件）。请明日再来或升级 Pro。`);
        return;
      }
    }

    setIsConverting(true);
    await ensureWorker();

    for (const item of queue) {
      const effectiveOutputExt = item.outputExt;
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? { ...x, outputExt: effectiveOutputExt, status: "converting", progress: 0 }
            : x
        )
      );
      try {
        let blob: Blob;
        if (item.kind === "pdf" && effectiveOutputExt === "pdf") {
          blob = new Blob([await item.file.arrayBuffer()], { type: "application/pdf" });
        } else if (item.kind === "image" && effectiveOutputExt === "pdf") {
          blob = await imageToPdf(item.file);
        } else {
          const outputBuffer = await convertWithWorker(item, effectiveOutputExt);
          const mime = mimeForOutput(item.kind, effectiveOutputExt);
          blob = new Blob([outputBuffer], { type: mime });
        }
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? { ...x, outputExt: effectiveOutputExt, convertedBlob: blob, progress: 100, status: "success" }
              : x
          )
        );
        if (!proUser) {
          consumeConversions(1);
          refreshMembershipUi();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "转换失败";
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: "error", error: msg } : x)));
      } finally {
        resolverRef.current.delete(item.id);
      }
    }
    setIsConverting(false);
  };

  const triggerDownload = (item: Item) => {
    if (!item.convertedBlob) return;
    const mime = mimeForOutput(item.kind, item.outputExt);
    const blob =
      item.convertedBlob.type && item.convertedBlob.type !== "application/octet-stream"
        ? item.convertedBlob
        : new Blob([item.convertedBlob], { type: mime });
    downloadBlob(blob, renameExt(item.file.name, item.outputExt));
  };

  const zipAll = async () => {
    const done = items.filter((x) => x.convertedBlob);
    if (!done.length) return;
    setIsZipping(true);
    try {
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
      downloadBlob(zipped, "all-converted-files.zip");
    } finally {
      setIsZipping(false);
    }
  };

  const statusLabel = (s: ConvertStatus) => {
    if (s === "queued") return "排队中";
    if (s === "converting") return "转换中";
    if (s === "success") return "转换成功";
    return "转换失败";
  };

  const activatePro = () => {
    savePlanToStorage("pro");
    refreshMembershipUi();
  };

  return (
    <div className="min-h-screen bg-[#06080f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSimulateSuccess={() => {
          activatePro();
          setPaymentOpen(false);
        }}
      />

      <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">
            今日剩余次数：<strong className="text-white">{proUser ? "∞（Pro）" : `${remainingToday} 次`}</strong>
          </span>
          <span className="hidden text-slate-400 sm:inline">|</span>
          <span className="text-slate-300">
            单文件上限：<strong className="text-white">{size(maxBytes)}</strong>
            {proUser ? " · Pro" : " · 游客"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            定价方案
          </Link>
          {!proUser ? (
            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Upgrade to Pro
            </button>
          ) : (
            <span className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300">
              Pro 已解锁
            </span>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e1423] to-[#090d17] p-8 shadow-2xl shadow-black/30">
          <div className="mb-8 flex items-center gap-3 text-sky-300">
            <Zap className="h-5 w-5" />
            <span className="text-sm uppercase tracking-[0.24em] text-sky-200/80">Pro Local Converter</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Ultimate Media Converter</h1>
          <p className="mt-3 text-slate-300">全部转换在浏览器本地完成，不上传服务器。</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">队列</p>
              <p className="mt-1 text-2xl font-semibold">{items.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">完成</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">{totalDone}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase text-slate-400">引擎状态</p>
              <p className="mt-1 text-sm text-slate-200">
                {workerReady ? "FFmpeg Worker 已就绪 (SharedArrayBuffer)" : "待加载"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-100">
              已自动识别格式；每张卡片内选择转出格式
            </div>
            <label className="ml-auto flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              视频转码档位
              <select
                value={proUser ? videoPreset : "fast"}
                onChange={(e) => setVideoPreset(e.target.value as VideoQualityPreset)}
                disabled={!proUser}
                className="rounded-md border border-white/20 bg-[#0c111d] px-2 py-1 outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="fast">极速</option>
                <option value="standard">标准（Pro）</option>
                <option value="high">高质量 / 高清（Pro）</option>
              </select>
            </label>
          </div>
          {!proUser ? (
            <p className="mt-2 text-xs text-slate-500">游客仅可使用「极速」视频转码；升级 Pro 解锁标准与高清参数。</p>
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
            <p className="text-lg font-medium">拖拽上传或点击选择文件</p>
            <p className="text-sm text-slate-400">支持 PDF、音视频与主流图片；PDF 可通过文件头识别</p>
          </button>
          <input ref={inputRef} type="file" accept={ACCEPTS.join(",")} multiple onChange={onInput} className="hidden" />

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={isConverting || !items.some((x) => x.status === "queued")}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {isConverting || engineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              全部转换
            </button>
            <button
              type="button"
              onClick={() => void zipAll()}
              disabled={!items.some((x) => x.convertedBlob) || isZipping}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isZipping ? "打包中..." : "一键打包下载 (JSZip)"}
            </button>
            <button
              type="button"
              onClick={() => void mergePdfs()}
              disabled={mergeBusy || pdfItems.length < 2 || !proUser}
              title={!proUser ? "升级 Pro 解锁 PDF 批量合并" : undefined}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-400/50 bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-100 disabled:opacity-50"
            >
              {mergeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              PDF 批量合并（Pro）
            </button>
          </div>
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
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 text-slate-400">
                  {item.kind.toUpperCase()}
                </div>
              )}
              <div className="mt-3 text-sm text-slate-300">
                <p>输入：{extOf(item.file.name).toUpperCase() || (item.kind === "pdf" ? "PDF" : "UNKNOWN")}</p>
                <p>原始大小：{size(item.file.size)}</p>
                <p>转换后：{item.convertedBlob ? size(item.convertedBlob.size) : "--"}</p>
                {item.error ? <p className="text-red-300">{item.error}</p> : null}
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm">
                <span className="text-slate-200">转出格式</span>
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
                  className="rounded-md border border-white/20 bg-[#0c111d] px-2 py-1 outline-none disabled:opacity-60"
                >
                  {outputOptionsForKind(item.kind).map((ext) => (
                    <option key={ext} value={ext}>
                      {ext.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              {item.status === "converting" ? (
                <div>
                  <CircularProgress progress={item.progress} />
                  <p className="mt-1 text-center text-xs text-slate-500">环形进度</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => triggerDownload(item)}
                disabled={!item.convertedBlob}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                下载
              </button>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
