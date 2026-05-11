/**
 * Single source for AdSense publisher ID (must match your AdSense account).
 * Override with NEXT_PUBLIC_ADSENSE_CLIENT_ID on Vercel / .env.local (format ca-pub-xxxxxxxx).
 */
export const ADSENSE_CLIENT_ID =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() || "ca-pub-6082968341630147";

/** Create display units in AdSense and paste slot IDs here or via env (must be numeric strings from AdSense). */
export const ADSENSE_SLOTS = {
  railLeft: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEFT?.trim() || "1111111111",
  railRight: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RIGHT?.trim() || "2222222222",
  footer: process.env.NEXT_PUBLIC_ADSENSE_SLOT_FOOTER?.trim() || "3333333333",
} as const;
