"use client";

import { useEffect } from "react";
import { ADSENSE_CLIENT_ID } from "@/lib/ads-config";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdComponentProps = {
  slot: string;
  className?: string;
  /** Sidebar rails use a tall min-height for vertical-style placements */
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
};

const formatClassMap: Record<NonNullable<AdComponentProps["format"]>, string> = {
  auto: "min-h-[90px]",
  rectangle: "min-h-[250px]",
  horizontal: "min-h-[90px]",
  vertical: "min-h-[600px]",
};
const PLACEHOLDER_SLOTS = new Set(["1111111111", "2222222222", "3333333333"]);

export default function AdComponent({
  slot,
  className,
  format = "auto",
}: AdComponentProps) {
  const clientId = ADSENSE_CLIENT_ID;
  const isPlaceholderSlot = PLACEHOLDER_SLOTS.has(slot);

  useEffect(() => {
    if (isPlaceholderSlot) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ignore AdSense runtime errors in local/dev.
    }
  }, [clientId, isPlaceholderSlot]);

  if (isPlaceholderSlot) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl border border-amber-300/40 bg-transparent ${formatClassMap[format]} ${className ?? ""}`}
      >
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
          <span className="rounded-md border border-amber-300/60 bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-200">
            Ad Space for Rent
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-black/20 ${className ?? ""}`}>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format={format === "vertical" ? "vertical" : format}
        data-full-width-responsive={format === "vertical" ? undefined : "true"}
      />
    </div>
  );
}

