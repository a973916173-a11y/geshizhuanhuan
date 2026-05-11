import jwt from "jsonwebtoken";

/**
 * Apple requires a short-lived JWT as OAuth client_secret (ES256).
 * Regenerated when auth routes load — safe for serverless.
 */
export function generateAppleClientSecret(): string {
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !clientId || !keyId || !rawKey) {
    throw new Error("Apple OAuth env vars are incomplete (APPLE_TEAM_ID, APPLE_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY)");
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    expiresIn: "180d",
    issuer: teamId,
    audience: "https://appleid.apple.com",
    subject: clientId,
    header: {
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    },
  });
}

export function isAppleOAuthConfigured(): boolean {
  return Boolean(
    process.env.APPLE_ID?.trim() &&
      process.env.APPLE_TEAM_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_PRIVATE_KEY?.trim()
  );
}
