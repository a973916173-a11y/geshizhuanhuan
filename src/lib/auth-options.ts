import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import FacebookProvider from "next-auth/providers/facebook";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { generateAppleClientSecret, isAppleOAuthConfigured } from "@/lib/apple-secret";
import { prisma } from "@/lib/db";
import { effectivePlanFromDb } from "@/lib/plan-server";
import type { Plan } from "@/lib/membership";

const googleConfigured =
  Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());

function githubClientCredentials(): { id: string; secret: string } | null {
  const id =
    process.env.GITHUB_ID?.trim() ||
    process.env.AUTH_GITHUB_ID?.trim();
  const secret =
    process.env.GITHUB_SECRET?.trim() ||
    process.env.AUTH_GITHUB_SECRET?.trim();
  if (!id || !secret) return null;
  return { id, secret };
}

const githubCredentials = githubClientCredentials();
const githubConfigured = githubCredentials !== null;

const facebookConfigured =
  Boolean(process.env.FACEBOOK_CLIENT_ID?.trim()) &&
  Boolean(process.env.FACEBOOK_CLIENT_SECRET?.trim());

const oauthProviders: NextAuthOptions["providers"] = [];

if (googleConfigured) {
  oauthProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (isAppleOAuthConfigured()) {
  oauthProviders.push(
    AppleProvider({
      clientId: process.env.APPLE_ID!,
      clientSecret: generateAppleClientSecret(),
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (githubConfigured && githubCredentials) {
  oauthProviders.push(
    GitHubProvider({
      clientId: githubCredentials.id,
      clientSecret: githubCredentials.secret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (facebookConfigured) {
  oauthProviders.push(
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  // Required on Vercel / reverse proxies so NEXTAUTH_URL matches the public host.
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...oauthProviders,
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  /**
   * Database sessions work reliably with PrismaAdapter + OAuth (GitHub/Google).
   * JWT-only mode often causes subtle OAuth/account linking issues with the adapter.
   */
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      if (!user?.id || !session.user) return session;
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) return session;
      const effective = effectivePlanFromDb(dbUser.plan, dbUser.planExpiresAt) as Plan;
      session.user.id = user.id;
      session.user.email = dbUser.email ?? undefined;
      session.user.name = dbUser.name ?? undefined;
      session.user.image = dbUser.image ?? undefined;
      session.user.plan = dbUser.plan;
      session.user.planExpiresAt = dbUser.planExpiresAt?.toISOString() ?? null;
      session.user.effectivePlan = effective;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
