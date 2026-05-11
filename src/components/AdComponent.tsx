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

export default function AdComponent({
  slot,
  className,
  format = "auto",
}: AdComponentProps) {
  const clientId = ADSENSE_CLIENT_ID;

  useEffect(() => {
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ignore AdSense runtime errors in local/dev.
    }
  }, [clientId]);

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

