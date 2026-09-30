import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 15 * 60 * 1000;

type PreviewClaims = { shop: string; popupId: string; exp: number };

function secret(): string {
  const value = process.env.SHOPIFY_API_SECRET;
  if (!value) throw new Error("SHOPIFY_API_SECRET is not set.");
  return value;
}

export function signPreviewToken(shop: string, popupId: string, exp = Date.now() + TTL_MS): string {
  const payload = Buffer.from(
    JSON.stringify({ shop, popupId, exp } satisfies PreviewClaims),
  ).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export type PreviewLink = { url: string; expiresAt: number };

export function previewLink(shop: string, popupId: string): PreviewLink {
  const expiresAt = Date.now() + TTL_MS;
  const token = signPreviewToken(shop, popupId, expiresAt);
  return { url: `https://${shop}/?leaf_preview=${encodeURIComponent(token)}`, expiresAt };
}

export function verifyPreviewToken(token: string, shop: string): { popupId: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewClaims;
    if (claims.shop !== shop || claims.exp < Date.now() || !claims.popupId) return null;
    return { popupId: claims.popupId };
  } catch {
    return null;
  }
}
