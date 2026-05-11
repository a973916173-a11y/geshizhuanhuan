/**
 * Central registry for accepted extensions, output groups (UX), and category labels.
 * Keep ffmpeg-supported formats aligned with `ffmpegWorker.ts`.
 */

export type MediaKind = "image" | "audio" | "video" | "pdf" | "office";

/** Filter tabs / badges — four buckets for users */
export type UiCategoryId = "image" | "audio" | "video" | "document";

export function uiCategoryForKind(kind: MediaKind): UiCategoryId {
  if (kind === "image") return "image";
  if (kind === "audio") return "audio";
  if (kind === "video") return "video";
  return "document";
}

export const UI_CATEGORY_LABELS: Record<
  UiCategoryId,
  { title: string; short: string; hint: string }
> = {
  image: { title: "Images", short: "Img", hint: "PNG, JPEG, WebP, HEIC, TIFF…" },
  audio: { title: "Audio", short: "Aud", hint: "MP3, WAV, FLAC, AAC, Opus…" },
  video: { title: "Video", short: "Vid", hint: "MP4, MKV, MOV, GIF, WebM…" },
  document: { title: "Documents", short: "Doc", hint: "PDF, Word, Excel, TXT, CSV…" },
};

/** ---------- Inputs (lowercase extensions) ---------- */
export const IMAGE_INPUTS = [
  "jpg",
  "jpeg",
  "jfif",
  "pjpeg",
  "png",
  "webp",
  "bmp",
  "avif",
  "svg",
  "tiff",
  "tif",
  "heic",
  "heif",
  "ico",
  "apng",
] as const;

export const AUDIO_INPUTS = [
  "mp3",
  "wav",
  "aac",
  "m4a",
  "ogg",
  "opus",
  "flac",
  "aiff",
  "aif",
] as const;

export const VIDEO_INPUTS = [
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "gif",
  "flv",
  "mpeg",
  "mpg",
  "m4v",
  "ts",
  "wmv",
  "3gp",
  "ogv",
] as const;

export const PDF_INPUTS = ["pdf"] as const;

/** Word, Excel, plain text / CSV */
export const OFFICE_WORD_INPUTS = ["docx"] as const;
export const OFFICE_EXCEL_INPUTS = ["xlsx", "xls", "csv"] as const;
export const OFFICE_TEXT_INPUTS = ["txt", "md", "log", "rtf"] as const;

export type OfficeSubtype = "word" | "excel" | "text";

export const ALL_OFFICE_INPUTS = [
  ...OFFICE_WORD_INPUTS,
  ...OFFICE_EXCEL_INPUTS,
  ...OFFICE_TEXT_INPUTS,
] as const;

export function detectOfficeSubtype(ext: string): OfficeSubtype | null {
  const e = ext.toLowerCase();
  if ((OFFICE_EXCEL_INPUTS as readonly string[]).includes(e)) return "excel";
  if ((OFFICE_WORD_INPUTS as readonly string[]).includes(e)) return "word";
  if ((OFFICE_TEXT_INPUTS as readonly string[]).includes(e)) return "text";
  return null;
}

/** ---------- Outputs ---------- */
export const IMAGE_OUTPUTS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "bmp",
  "gif",
  "tiff",
  "ico",
  "pdf",
] as const;

/** Audio transcoding targets (also used when extracting from video in UI). */
export const AUDIO_OUTPUTS = ["mp3", "wav", "aac", "ogg", "flac", "m4a", "opus", "aiff"] as const;

/** Video containers + GIF + audio-only outputs from video. */
export const VIDEO_OUTPUTS = [
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "flv",
  "mpeg",
  "mpg",
  "ts",
  "wmv",
  "3gp",
  "ogv",
  "gif",
  "mp3",
  "wav",
  "aac",
  "ogg",
  "flac",
  "m4a",
  "opus",
  "aiff",
] as const;

export const OFFICE_WORD_OUTPUTS = ["html", "pdf", "txt"] as const;
export const OFFICE_EXCEL_OUTPUTS = ["html", "pdf", "csv"] as const;
export const OFFICE_TEXT_OUTPUTS = ["html", "pdf"] as const;

export function flatOutputsForKind(kind: MediaKind, officeSubtype?: OfficeSubtype): readonly string[] {
  if (kind === "office") {
    if (officeSubtype === "excel") return OFFICE_EXCEL_OUTPUTS;
    if (officeSubtype === "text") return OFFICE_TEXT_OUTPUTS;
    return OFFICE_WORD_OUTPUTS;
  }
  if (kind === "image") return IMAGE_OUTPUTS;
  if (kind === "audio") return AUDIO_OUTPUTS;
  if (kind === "video") return VIDEO_OUTPUTS;
  if (kind === "pdf") return ["pdf"] as const;
  return ["pdf"] as const;
}

export type OutputGroup = { label: string; options: { value: string; label: string }[] };

function opt(value: string, label: string) {
  return { value, label };
}

/** Grouped options for <optgroup> */
export function outputGroupsForKind(kind: MediaKind, officeSubtype?: OfficeSubtype): OutputGroup[] {
  if (kind === "office") {
    if (officeSubtype === "excel") {
      return [
        {
          label: "Web & data",
          options: [
            opt("html", "HTML table (preview)"),
            opt("csv", "CSV"),
          ],
        },
        {
          label: "Print-style",
          options: [opt("pdf", "PDF (rendered)")],
        },
      ];
    }
    if (officeSubtype === "text") {
      return [
        {
          label: "Output",
          options: [opt("html", "HTML"), opt("pdf", "PDF (paginated)")],
        },
      ];
    }
    return [
      {
        label: "Web & text",
        options: [opt("html", "HTML"), opt("txt", "Plain text (.txt)")],
      },
      {
        label: "Print-style",
        options: [opt("pdf", "PDF (rendered)")],
      },
    ];
  }

  if (kind === "image") {
    return [
      {
        label: "Common raster",
        options: [
          opt("png", "PNG"),
          opt("jpg", "JPEG (.jpg)"),
          opt("webp", "WebP"),
          opt("avif", "AVIF"),
        ],
      },
      {
        label: "Other image",
        options: [
          opt("bmp", "BMP"),
          opt("gif", "GIF"),
          opt("tiff", "TIFF"),
          opt("ico", "ICO icon"),
        ],
      },
      {
        label: "Document",
        options: [opt("pdf", "Single-page PDF")],
      },
    ];
  }

  if (kind === "audio") {
    return [
      {
        label: "Lossy (smaller files)",
        options: [
          opt("mp3", "MP3"),
          opt("aac", "AAC"),
          opt("m4a", "M4A (AAC)"),
          opt("ogg", "Ogg Vorbis"),
          opt("opus", "Opus"),
        ],
      },
      {
        label: "Lossless / hi-fi",
        options: [opt("flac", "FLAC"), opt("wav", "WAV"), opt("aiff", "AIFF")],
      },
    ];
  }

  if (kind === "video") {
    return [
      {
        label: "Video (recommended)",
        options: [
          opt("mp4", "MP4 (H.264 + AAC)"),
          opt("webm", "WebM (VP8/VP9)"),
          opt("mov", "QuickTime MOV"),
          opt("mkv", "Matroska MKV"),
          opt("avi", "AVI"),
          opt("m4v", "M4V"),
        ],
      },
      {
        label: "More containers",
        options: [
          opt("flv", "FLV"),
          opt("mpeg", "MPEG"),
          opt("mpg", "MPG"),
          opt("ts", "MPEG-TS"),
          opt("wmv", "WMV (codec-dependent)"),
          opt("3gp", "3GP"),
          opt("ogv", "Ogg Theora"),
        ],
      },
      {
        label: "GIF / audio-only",
        options: [
          opt("gif", "GIF animation"),
          opt("mp3", "Audio only — MP3"),
          opt("wav", "Audio only — WAV"),
          opt("aac", "Audio only — AAC"),
          opt("flac", "Audio only — FLAC"),
          opt("m4a", "Audio only — M4A"),
          opt("ogg", "Audio only — Ogg"),
          opt("opus", "Audio only — Opus"),
          opt("aiff", "Audio only — AIFF"),
        ],
      },
    ];
  }

  if (kind === "pdf") {
    return [
      {
        label: "PDF",
        options: [opt("pdf", "Keep as PDF")],
      },
    ];
  }

  return [{ label: "Output", options: [opt("pdf", "PDF")] }];
}

function normalizeExtAlias(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpeg" || e === "jfif" || e === "pjpeg") return "jpg";
  return e;
}

export function defaultOutputExtension(
  inputExt: string,
  kind: MediaKind,
  officeSubtype?: OfficeSubtype
): string {
  const opts = [...flatOutputsForKind(kind, officeSubtype)];
  const inNorm = normalizeExtAlias(inputExt);
  const pick =
    opts.find((o) => normalizeExtAlias(o) !== inNorm) ?? opts[0];
  return pick ?? "pdf";
}
