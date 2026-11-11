// PROTOTYPE — throwaway. Lives on prototype/notification-feed only.
import { createSign } from "node:crypto";

function env(name: string) {
  if (!process.env[name]) {
    // Vite dev doesn't put .env into process.env.
    try {
      process.loadEnvFile(".env");
    } catch {}
  }
  return process.env[name];
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

// Knock enhanced security: RS256 JWT, `sub` = Knock user id.
export function signKnockUserToken(userId: number) {
  const signingKey = env("KNOCK_SIGNING_KEY");
  if (!signingKey) return null;
  const pem = signingKey.includes("BEGIN")
    ? signingKey
    : Buffer.from(signingKey, "base64").toString("utf8");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: String(userId), iat: now, exp: now + 60 * 60 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(pem).toString("base64url")}`;
}

export function getNotificationFeedPrototypeConfig(userId: number | null) {
  if (!userId) return null;
  const publicKey = env("KNOCK_PUBLIC_API_KEY");
  const channelId = env("KNOCK_FEED_CHANNEL_ID");
  const userToken = signKnockUserToken(userId);
  if (!publicKey || !channelId || !userToken) return null;
  return { publicKey, channelId, userId: String(userId), userToken };
}
