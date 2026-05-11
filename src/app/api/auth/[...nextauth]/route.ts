import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

/** Prisma + bcrypt must run on Node; avoid Edge runtime on Vercel. */
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
