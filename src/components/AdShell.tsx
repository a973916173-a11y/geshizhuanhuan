"use client";

import AdComponent from "@/components/AdComponent";
import { ADSENSE_SLOTS } from "@/lib/ads-config";

/**
 * Responsive layout: skyscraper-style ads on the left & right (xl+), horizontal ad at the bottom.
 * Replace default slot IDs with real ad unit IDs from AdSense (Ads → By ad unit), or set
 * NEXT_PUBLIC_ADSENSE_SLOT_LEFT / _RIGHT / _FOOTER on Vercel.
 */
export function AdShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-6">
          <aside className="hidden w-44 shrink-0 xl:block xl:sticky xl:top-6 xl:self-start">
            <AdComponent slot={ADSENSE_SLOTS.railLeft} format="vertical" className="w-full" />
          </aside>

          <div className="min-w-0 flex-1">{children}</div>

          <aside className="hidden w-44 shrink-0 xl:block xl:sticky xl:top-6 xl:self-start">
            <AdComponent slot={ADSENSE_SLOTS.railRight} format="vertical" className="w-full" />
          </aside>
        </div>

        <footer className="mt-10 w-full border-t border-white/10 pt-8">
          <AdComponent slot={ADSENSE_SLOTS.footer} format="horizontal" />
        </footer>
      </div>
    </div>
  );
}
