import {
  ALL_OFFICE_INPUTS,
  AUDIO_INPUTS,
  IMAGE_INPUTS,
  PDF_INPUTS,
  VIDEO_INPUTS,
} from "@/lib/format-registry";

/** `accept` attribute for `<input type="file">` */
export function buildAcceptAttribute(): string {
  const all = [
    ...IMAGE_INPUTS,
    ...AUDIO_INPUTS,
    ...VIDEO_INPUTS,
    ...PDF_INPUTS,
    ...ALL_OFFICE_INPUTS,
  ];
  return Array.from(new Set(all)).map((e) => `.${e}`).join(",");
}
