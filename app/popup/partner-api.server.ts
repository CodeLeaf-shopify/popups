import { PRO_PLAN_HANDLE } from "./plans";

const PARTNER_API_VERSION = "2026-07";

const ACTIVE_SUBSCRIPTION = `query LeafPopupsActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    items { handle }
  }
}`;

type ActiveSubscription = {
  items: { handle: string }[];
} | null;

export function partnerApiConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_PARTNER_ORG_ID &&
      process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN &&
      process.env.SHOPIFY_APP_GID,
  );
}

export function planSelectionUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "leaf-popups";
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export async function fetchActiveSubscription(shopId: string): Promise<ActiveSubscription> {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const appId = process.env.SHOPIFY_APP_GID;
  if (!orgId || !token || !appId) {
    throw new Error("Shopify Partner API credentials are not configured.");
  }

  const response = await fetch(`https://partners.shopify.com/${orgId}/api/${PARTNER_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: ACTIVE_SUBSCRIPTION,
      variables: { appId, shopId },
    }),
  });
  const body = (await response.json()) as {
    data?: { activeSubscription: ActiveSubscription };
    errors?: { message: string }[];
  };
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error) => error.message).join("; ") || `Partner API returned ${response.status}.`;
    throw new Error(message);
  }
  return body.data?.activeSubscription ?? null;
}

export function planFromSubscription(subscription: ActiveSubscription): "free" | "pro" {
  const handles = subscription?.items.map((item) => item.handle) ?? [];
  return handles.includes(PRO_PLAN_HANDLE) ? "pro" : "free";
}
