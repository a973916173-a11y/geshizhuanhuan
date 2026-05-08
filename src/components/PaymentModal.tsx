"use client";

import { Check, CreditCard, Smartphone, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSimulateSuccess: () => void;
};

export function PaymentModal({ open, onClose, onSimulateSuccess }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#131a2e] to-[#0a0e18] p-6 shadow-2xl shadow-sky-900/40">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-sky-400">Upgrade</p>
            <h2 className="mt-1 text-xl font-semibold text-white">升级到 Pro</h2>
            <p className="mt-1 text-sm text-slate-400">演示支付流程，不会产生真实扣款</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              onSimulateSuccess();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-sky-500/50 hover:bg-sky-500/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">信用卡 / 借记卡（模拟）</p>
              <p className="text-xs text-slate-500">立即解锁 Pro 全部功能</p>
            </div>
            <Check className="h-4 w-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => {
              onSimulateSuccess();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">Apple Pay / Google Pay（模拟）</p>
              <p className="text-xs text-slate-500">一键完成升级</p>
            </div>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          点击任一方式即视为模拟支付成功并写入本地 Pro 状态
        </p>
      </div>
    </div>
  );
}
