"use client";

import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function oauthSortOrder(id: string): number {
  const order: Record<string, number> = { github: 0, google: 1, apple: 2, facebook: 3 };
  return order[id] ?? 50;
}

function providerLabel(id: string, name: string): string {
  switch (id) {
    case "google":
      return "Continue with Google";
    case "apple":
      return "Continue with Apple";
    case "github":
      return "使用 GitHub 登录";
    case "facebook":
      return "Continue with Facebook";
    default:
      return `Continue with ${name}`;
  }
}

function providerButtonClass(id: string): string {
  switch (id) {
    case "google":
      return "border border-white/20 bg-white text-slate-900 hover:bg-slate-100";
    case "apple":
      return "border border-white/15 bg-black text-white hover:bg-zinc-950";
    case "github":
      return "border border-white/10 bg-[#24292f] text-white hover:bg-[#2c3138]";
    case "facebook":
      return "border border-white/10 bg-[#1877f2] text-white hover:bg-[#166fe5]";
    default:
      return "border border-white/20 bg-white/10 text-white hover:bg-white/15";
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusyId, setOauthBusyId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    void getProviders().then(setProviders);
  }, []);

  const oauthList = useMemo(() => {
    if (!providers) return [];
    return Object.values(providers)
      .filter((p) => p.id !== "credentials")
      .sort((a, b) => oauthSortOrder(a.id) - oauthSortOrder(b.id));
  }, [providers]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onOAuth(providerId: string) {
    setError(null);
    setOauthBusyId(providerId);
    try {
      const res = await signIn(providerId, { callbackUrl, redirect: false });
      if (res?.url) {
        window.location.assign(res.url);
        return;
      }
      // Fallback for environments where signIn() doesn't return url reliably.
      window.location.assign(
        `/api/auth/signin/${providerId}?callbackUrl=${encodeURIComponent(callbackUrl)}`
      );
    } finally {
      setOauthBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#06080f] px-4 py-16 text-white">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0c111d] p-8 shadow-xl">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with Google, Apple, GitHub, Facebook, or email — same pattern as most U.S. consumer sites.
        </p>

        {providers === null ? (
          <div className="mt-8 py-6 text-center text-sm text-slate-500">Loading sign-in options…</div>
        ) : oauthList.length === 0 ? (
          <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
            No social login is configured yet. Add env vars for Google / Apple / GitHub (see{" "}
            <code className="text-amber-50">.env.example</code>) or use email below.
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {oauthList.map((provider) => (
              <button
                key={provider.id}
                type="button"
                disabled={oauthBusyId !== null}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-70 ${providerButtonClass(provider.id)}`}
                onClick={() => void onOAuth(provider.id)}
              >
                {oauthBusyId === provider.id ? "Redirecting…" : providerLabel(provider.id, provider.name)}
              </button>
            ))}
          </div>
        )}

        <div className="my-8 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-slate-500">or email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm text-slate-300">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#06080f] px-3 py-2 text-white outline-none focus:border-sky-500"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-[#06080f] px-3 py-2 text-white outline-none focus:border-sky-500"
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in with email"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          No account?{" "}
          <Link href="/register" className="text-sky-400 hover:text-sky-300">
            Register
          </Link>
        </p>
        <p className="mt-4 text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Back to converter
          </Link>
        </p>
      </div>
    </div>
  );
}
