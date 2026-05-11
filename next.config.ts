import type { NextConfig } from "next";

/**
 * Do NOT set Cross-Origin-Embedder-Policy: require-corp on the whole site.
 * That header blocks third-party embeds (including Google AdSense iframes/scripts).
 *
 * COOP+COEP were previously used for crossOriginIsolated / SharedArrayBuffer with FFmpeg.
 * Video conversion still runs without it (single-threaded WASM path).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
