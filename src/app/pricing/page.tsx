"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { PaymentModal } from "@/components/PaymentModal";
import { setPlan } from "@/lib/membership";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "永久",
    desc: "轻度试用",
    features: ["单文件最大 5MB", "每日 3 次转换", "基础格式转换"],
    cta: "当前方案",
    highlighted: false,
    action: "current" as const,
  },
  {
    name: "Basic",
    price: "$9",
    period: "/月",
    desc: "个人创作者",
    features: ["单文件最高 100MB", "更高每日配额（演示）", "优先格式支持"],
    cta: "选择 Basic",
    highlighted: false,
    action: "upgrade" as const,
  },
  {
    name: "Unlimited",
    price: "$19",
    period: "/月",
    desc: "团队与重度用户",
    features: ["100MB 单文件上限", "PDF 批量合并", "高清视频转码", "全部 Pro 功能"],
    cta: "Upgrade to Pro",
    highlighted: true,
    action: "upgrade" as const,
  },
];

export default function PricingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const handleSimulatePro = () => {
    setPlan("pro");
  };

  return (
    <div className="min-h-screen bg-[#06080f] px-4 py-16 text-white sm:px-6 lg:px-8">
      <PaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSimulateSuccess={handleSimulatePro}
      />

      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">选择适合你的方案</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            参考 Convertio 风格的三档定价。支付为本地模拟，用于演示商业化流程。
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm text-slate-300 transition hover:border-white/40 hover:text-white"
          >
            ← 返回转换器
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
                  最受欢迎
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
                  onClick={() => setModalOpen(true)}
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
    </div>
  );
}
