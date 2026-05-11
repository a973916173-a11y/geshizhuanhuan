"use client";

import { Check, CreditCard, Loader2, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
        onCancel: () => void;
      }) => { render: (container: HTMLElement | string) => Promise<void> };
    };
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after PayPal capture succeeds or after demo unlock */
  onProUnlocked: (tier: "pro" | "max") => void;
  selectedTier: "pro" | "max";
};

type PayPalUiState = "idle" | "loading_script" | "mounting_buttons" | "ready" | "error";

export function PaymentModal({ open, onClose, onProUnlocked, selectedTier }: Props) {
  const { status, update } = useSession();

  const paypalClientId = useMemo(
    () => process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? "",
    []
  );

  const showDemoUnlock =
    process.env.NODE_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_PAYPAL_SHOW_DEMO === "true" || !paypalClientId);

  const paypalContainerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  const [paypalState, setPaypalState] = useState<PayPalUiState>("idle");
  const [paypalError, setPaypalError] = useState<string | null>(null);

  const renderButtons = useCallback(async () => {
    const container = paypalContainerRef.current;
    if (!container || !window.paypal) {
      return false;
    }

    setPaypalState("mounting_buttons");
    setPaypalError(null);
    container.innerHTML = "";

    try {
      await window.paypal
        .Buttons({
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tier: selectedTier }),
            });
            const data = (await res.json()) as { id?: string; error?: string };
            if (!res.ok || !data.id) {
              throw new Error(data.error ?? "Could not create order");
            }
            return data.id;
          },
          onApprove: async (data) => {
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: data.orderID, tier: selectedTier }),
            });
            const result = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !result.ok) {
              throw new Error(result.error ?? "Payment capture failed");
            }
            await update();
            await onProUnlocked(selectedTier);
            onClose();
          },
          onError: () => {
            window.alert(
              "Something went wrong during checkout. Please try again or use another payment method. If you were charged, contact support with your receipt — do not pay twice."
            );
          },
          onCancel: () => {
            window.alert(
              "Payment canceled. You can finish checkout anytime from the Pricing page."
            );
          },
        })
        .render(container);

      mountedRef.current = true;
      setPaypalState("ready");
      return true;
    } catch (e) {
      mountedRef.current = false;
      const msg = e instanceof Error ? e.message : "PayPal render failed";
      setPaypalError(msg);
      setPaypalState("error");
      return false;
    }
  }, [onClose, onProUnlocked, selectedTier, update]);

  useLayoutEffect(() => {
    if (!open || !paypalClientId || status !== "authenticated") {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setPaypalState("loading_script");
      setPaypalError(null);
    });
    mountedRef.current = false;

    const mountTarget = paypalContainerRef.current;

    const sdkSrc = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalClientId)}&currency=USD&intent=capture`;

    const waitForPayPalGlobal = async (): Promise<void> => {
      if (window.paypal) return;
      for (let i = 0; i < 150; i++) {
        if (cancelled) return;
        if (window.paypal) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(
        "PayPal SDK did not initialize. On localhost use Sandbox app credentials + PAYPAL_MODE=sandbox, whitelist http://localhost:3000 in the PayPal developer app, and disable ad blockers."
      );
    };

    const loadScript = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (window.paypal) {
          resolve();
          return;
        }

        let script = document.querySelector(
          `script[data-app-paypal="${paypalClientId}"]`
        ) as HTMLScriptElement | null;

        if (!script) {
          script = document.createElement("script");
          script.dataset.appPaypal = paypalClientId;
          script.src = sdkSrc;
          script.async = true;
          script.onload = () => {
            script!.dataset.loaded = "true";
            resolve();
          };
          script.onerror = () =>
            reject(
              new Error(
                "Could not load PayPal script. Check network, firewall, or ad blockers blocking paypal.com."
              )
            );
          document.body.appendChild(script);
          return;
        }

        if (script.dataset.loaded === "true" || window.paypal) {
          resolve();
          return;
        }

        script.addEventListener(
          "load",
          () => {
            script!.dataset.loaded = "true";
            resolve();
          },
          { once: true }
        );
        script.addEventListener(
          "error",
          () =>
            reject(
              new Error(
                "PayPal script tag failed. Remove conflicting extensions or allow third-party scripts."
              )
            ),
          { once: true }
        );
      });

    void (async () => {
      try {
        await loadScript();
        await waitForPayPalGlobal();
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          if (!paypalContainerRef.current) return;
          void renderButtons();
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "PayPal failed to load";
        setPaypalError(msg);
        setPaypalState("error");
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      mountTarget?.replaceChildren();
    };
  }, [open, paypalClientId, selectedTier, renderButtons, status]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#131a2e] to-[#0a0e18] p-6 shadow-2xl shadow-sky-900/40">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-sky-400">Upgrade</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Upgrade to {selectedTier.toUpperCase()}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {paypalClientId
                ? "Pay securely with PayPal (payments are processed by PayPal)."
                : "Add PayPal credentials to accept real payments; demo mode is for local testing only."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {paypalClientId ? (
          <div className="space-y-4">
            {status === "loading" ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                Checking your account…
              </div>
            ) : status !== "authenticated" ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                <p className="font-medium text-amber-50">Sign in required</p>
                <p className="mt-2 text-amber-100/90">
                  Membership is tied to your account and renews monthly after each successful payment. Please sign in
                  or register before paying with PayPal.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/login"
                    className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
                  >
                    Register
                  </Link>
                </div>
              </div>
            ) : (
              <>
            <div className="relative min-h-[120px] w-full rounded-lg border border-white/10 bg-black/20 px-2 py-3">
              {(paypalState === "loading_script" || paypalState === "mounting_buttons") && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0e18]/90 text-sm text-slate-300">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                  <span>Loading PayPal checkout…</span>
                </div>
              )}
              <div ref={paypalContainerRef} className="min-h-[48px] w-full [&_iframe]:min-h-[45px]" />
            </div>

            {paypalState === "error" && paypalError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-100">
                <p className="font-medium text-red-200">PayPal didn’t load</p>
                <p className="mt-1 text-red-100/90">{paypalError}</p>
                <p className="mt-2 text-red-200/80">
                  On your machine: use{" "}
                  <code className="rounded bg-black/40 px-1">npm run dev</code> with{" "}
                  <code className="rounded bg-black/40 px-1">NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> set. For testing,
                  prefer{" "}
                  <strong>PayPal Sandbox</strong> keys and{" "}
                  <code className="rounded bg-black/40 px-1">PAYPAL_MODE=sandbox</code>. Add{" "}
                  <code className="rounded bg-black/40 px-1">http://localhost:3000</code> under your PayPal app’s
                  allowed URLs if required.
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                  onClick={() => {
                    setPaypalState("idle");
                    setPaypalError(null);
                    paypalContainerRef.current?.replaceChildren();
                    mountedRef.current = false;
                  }}
                >
                  Dismiss message (close and reopen modal to retry)
                </button>
              </div>
            ) : null}

            <p className="text-center text-xs text-slate-500">
              After payment, your plan is saved on your account and stays active for <strong>30 days</strong>, then
              returns to Free unless you renew.
            </p>
              </>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Set server env vars{" "}
            <code className="text-amber-50">NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> and{" "}
            <code className="text-amber-50">PAYPAL_CLIENT_SECRET</code> (server-only), and{" "}
            <code className="text-amber-50">PAYPAL_MODE=live</code> or{" "}
            <code className="text-amber-50">sandbox</code> for testing.
          </p>
        )}

        {showDemoUnlock ? (
          <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
            <p className="text-xs text-slate-500">Local / demo: simulate unlock (no real charge)</p>
            <button
              type="button"
              onClick={() => {
                onProUnlocked(selectedTier);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-sky-500/50 hover:bg-sky-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Demo: card</p>
                <p className="text-xs text-slate-500">Save {selectedTier.toUpperCase()} locally</p>
              </div>
              <Check className="h-4 w-4 text-emerald-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                onProUnlocked(selectedTier);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Demo: wallet</p>
                <p className="text-xs text-slate-500">Save {selectedTier.toUpperCase()} locally</p>
              </div>
            </button>
          </div>
        ) : null}

        {!showDemoUnlock && paypalClientId ? (
          <p className="mt-6 text-center text-xs text-slate-500">
            If checkout fails or you cancel, try again. Your client secret stays on the server only.
          </p>
        ) : null}
      </div>
    </div>
  );
}
