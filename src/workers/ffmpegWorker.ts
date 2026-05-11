import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type ConvertPayload = {
  id: string;
  fileName: string;
  outputExt: string;
  fileBuffer: ArrayBuffer;
  kind: "image" | "audio" | "video" | "pdf";
  videoPreset: "fast" | "standard" | "high";
};

type WorkerRequest = { type: "init" } | { type: "convert"; payload: ConvertPayload };

type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; id: string; progress: number }
  | { type: "done"; id: string; outputBuffer: ArrayBuffer }
  | { type: "error"; id?: string; message: string };

const worker: Worker = self as unknown as Worker;
const ffmpeg = new FFmpeg();
let isLoaded = false;

const post = (message: WorkerResponse) => {
  worker.postMessage(message);
};

const getExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  return idx > -1 ? name.slice(idx + 1).toLowerCase() : "dat";
};

const AUDIO_OUT = new Set(["mp3", "wav", "aac", "ogg", "flac", "m4a", "opus", "aiff", "aif"]);

const getVideoArgs = (
  outputExt: string,
  videoPreset: ConvertPayload["videoPreset"]
) => {
  const speedMap = {
    fast: { preset: "ultrafast", crf: "32", audioBitrate: "96k" },
    standard: { preset: "veryfast", crf: "28", audioBitrate: "128k" },
    high: { preset: "medium", crf: "23", audioBitrate: "160k" },
  } as const;

  const profile = speedMap[videoPreset];

  if (outputExt === "webm") {
    return [
      "-c:v",
      "libvpx",
      "-cpu-used",
      videoPreset === "fast" ? "8" : videoPreset === "standard" ? "5" : "2",
      "-b:v",
      videoPreset === "fast" ? "700k" : videoPreset === "standard" ? "1200k" : "2000k",
      "-c:a",
      "libvorbis",
      "-b:a",
      profile.audioBitrate,
    ];
  }

  return [
    "-c:v",
    "libx264",
    "-preset",
    profile.preset,
    "-crf",
    profile.crf,
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    profile.audioBitrate,
  ];
};

function buildFfmpegCommand(
  kind: ConvertPayload["kind"],
  inputName: string,
  outputName: string,
  outputExt: string,
  videoPreset: ConvertPayload["videoPreset"]
): string[] {
  if (kind === "video" && AUDIO_OUT.has(outputExt)) {
    if (outputExt === "mp3") {
      return ["-i", inputName, "-vn", "-acodec", "libmp3lame", "-q:a", "2", outputName];
    }
    if (outputExt === "wav") {
      return ["-i", inputName, "-vn", "-acodec", "pcm_s16le", "-ar", "44100", outputName];
    }
    if (outputExt === "aac") {
      return ["-i", inputName, "-vn", "-acodec", "aac", "-b:a", "192k", outputName];
    }
    if (outputExt === "ogg") {
      return ["-i", inputName, "-vn", "-acodec", "libvorbis", "-q:a", "6", outputName];
    }
    if (outputExt === "flac") {
      return ["-i", inputName, "-vn", "-acodec", "flac", outputName];
    }
    if (outputExt === "m4a") {
      return ["-i", inputName, "-vn", "-acodec", "aac", "-b:a", "192k", outputName];
    }
    if (outputExt === "opus") {
      return ["-i", inputName, "-vn", "-c:a", "libopus", "-b:a", "128k", outputName];
    }
    if (outputExt === "aiff" || outputExt === "aif") {
      return ["-i", inputName, "-vn", "-c:a", "pcm_s16be", outputName];
    }
  }

  if (kind === "video" && outputExt === "gif") {
    return [
      "-i",
      inputName,
      "-vf",
      "fps=12,scale=-1:480:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer",
      "-loop",
      "0",
      outputName,
    ];
  }

  if (kind === "video") {
    return ["-i", inputName, ...getVideoArgs(outputExt, videoPreset), outputName];
  }

  if (kind === "audio") {
    if (outputExt === "opus") {
      return ["-i", inputName, "-c:a", "libopus", "-b:a", "128k", outputName];
    }
    if (outputExt === "aiff" || outputExt === "aif") {
      return ["-i", inputName, "-c:a", "pcm_s16be", outputName];
    }
  }

  return ["-i", inputName, outputName];
}

const ensureLoaded = async () => {
  if (isLoaded) {
    return;
  }
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  isLoaded = true;
};

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  let activeId: string | undefined;
  try {
    if (event.data.type === "init") {
      await ensureLoaded();
      post({ type: "ready" });
      return;
    }

    const { id, fileName, outputExt, fileBuffer, kind, videoPreset } =
      event.data.payload;
    activeId = id;
    await ensureLoaded();

    const inputExt = getExt(fileName);
    const inputName = `${id}-input.${inputExt}`;
    const outputName = `${id}-output.${outputExt}`;

    const onProgress = ({ progress }: { progress: number }) => {
      post({ type: "progress", id, progress: Math.round(progress * 100) });
    };
    ffmpeg.on("progress", onProgress);

    await ffmpeg.writeFile(inputName, await fetchFile(new Blob([fileBuffer])));
    const command = buildFfmpegCommand(kind, inputName, outputName, outputExt, videoPreset);
    await ffmpeg.exec(command);
    const output = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    ffmpeg.off("progress", onProgress);

    const outputBuffer =
      output instanceof Uint8Array
        ? new Uint8Array(output).buffer
        : new TextEncoder().encode(String(output)).buffer;
    post({ type: "done", id, outputBuffer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker convert failed.";
    post({ type: "error", id: activeId, message });
  }
};
