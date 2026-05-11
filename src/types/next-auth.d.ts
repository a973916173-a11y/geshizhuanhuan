import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Supported at runtime in next-auth v4 on Vercel; types omit it by default. */
  interface AuthOptions {
    trustHost?: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      plan: string;
      planExpiresAt: string | null;
      effectivePlan: "free" | "pro" | "max";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    plan?: string;
    planExpiresAt?: string | null;
    effectivePlan?: string;
  }
}
