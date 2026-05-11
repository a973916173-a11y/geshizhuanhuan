"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { AdShell } from "@/components/AdShell";
import { PaymentModal } from "@/components/PaymentModal";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Try it out",
    features: [
      "Unlimited conversions",
      "Up to 100MB per file",
      "Basic processing speed",
      "Batch up to 5 files",
    ],
    cta: "Current plan",
    highlighted: false,
    action: "current" as const,
    tier: "pro" as const,
  },
  {
    name: "Pro",
    price: "$2.00",
    period: "/mo",
    desc: "Creators & everyday use",
    features: ["Up to 500MB per file", "Batch up to 10 files", "Standard priority speed"],
    cta: "Upgrade to Pro",
    highlighted: false,
    action: "upgrade" as const,
    tier: "pro" as const,
  },
  {
    name: "Max",
    price: "$5.00",
    period: "/mo",
    desc: "Power users",
    features: ["Unlimited file size", "Unlimited batch size", "Highest priority speed", "Everything in Pro"],
    cta: "Upgrade to Max",
    highlighted: true,
    action: "upgrade" as const,
    tier: "max" as const,
  },
];

export default function PricingPage() {
  const { update } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"pro" | "max">("pro");

  const handleUnlock = async (_tier: "pro" | "max") => {
    void _tier;
    await update();
  };

  return (
    <>
      <PaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedTier={selectedTier}
        onProUnlocked={handleUnlock}
      />

      <AdShell>
      <div className="mx-auto max-w-6xl pt-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Plans that fit how you work</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Free, Pro, and Max — start free and upgrade when you need more.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm text-slate-300 transition hover:border-white/40 hover:text-white"
          >
            ← Back to Goldfish Format Converter
          </Link>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-3xl border p-8 shadow-xl transition ${
                tier.highlighted
                  ? "border-sky-500/60 bg-gradient-to-b from-sky-950/40 to-[#0c111d] shadow-sky-900/30 ring-2 ring-sky-500/40"
                  : "border-white/10 bg-[#0c111d]/80"
              }`}
            >
              {tier.highlighted ? (
                <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </div>
              ) : null}
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{tier.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-slate-500">{tier.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-300">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.action === "current" ? (
                <button
                  type="button"
                  disabled
                  className="mt-8 w-full rounded-xl border border-white/15 py-3 text-sm font-medium text-slate-500"
                >
                  {tier.cta}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier(tier.tier);
                    setModalOpen(true);
                  }}
                  className={`mt-8 w-full rounded-xl py-3 text-sm font-semibold transition ${
                    tier.highlighted
                      ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                      : "border border-white/20 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {tier.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      </AdShell>
    </>
  );
}
