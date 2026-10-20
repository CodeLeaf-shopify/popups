import prisma from "../db.server";
import { adminGraphql, type AdminClient } from "./admin-graphql.server";
import {
  fetchActiveSubscription,
  partnerApiConfigured,
  planFromSubscription,
} from "./partner-api.server";
import { PLAN_STALE_MS, proUnlocked, type ShopPlan } from "./plans";

const SHOP_ID_QUERY = `#graphql
  query LeafPopupsShopId {
    shop { id }
  }
`;

const SHOP_PLAN_QUERY = `#graphql
  query LeafPopupsShopPlan {
    shop {
      plan {
        partnerDevelopment
      }
    }
  }
`;

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query LeafPopupsActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions { name status }
    }
  }
`;

export type PlanSnapshot = {
  plan: ShopPlan;
  unpublished: string[];
};

function parseNames(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  } catch {
    return [];
  }
}

function snapshot(row: { plan: string; unpublishedNames: string }): PlanSnapshot {
  return {
    plan: row.plan === "pro" ? "pro" : "free",
    unpublished: parseNames(row.unpublishedNames),
  };
}

export async function shopIsDevelopment(admin: AdminClient): Promise<boolean> {
  const data = await adminGraphql<{ shop: { plan: { partnerDevelopment: boolean } } }>(admin, SHOP_PLAN_QUERY);
  return data.shop.plan.partnerDevelopment === true;
}

async function shopGid(admin: AdminClient): Promise<string> {
  const data = await adminGraphql<{ shop: { id: string } }>(admin, SHOP_ID_QUERY);
  return data.shop.id;
}

async function planFromAdmin(admin: AdminClient): Promise<ShopPlan> {
  const data = await adminGraphql<{
    currentAppInstallation: { activeSubscriptions: { name: string; status: string }[] };
  }>(admin, ACTIVE_SUBSCRIPTIONS_QUERY);
  const pro = data.currentAppInstallation.activeSubscriptions.some(
    (subscription) => subscription.status === "ACTIVE" && /\bpro\b/i.test(subscription.name),
  );
  return pro ? "pro" : "free";
}

// The Partner API is Shopify's source of truth for App Pricing; the Admin API covers shops it misses
// (missing credentials, API errors, or subscriptions it doesn't report yet).
async function resolvePlan(admin: AdminClient, shop: string): Promise<ShopPlan> {
  if (partnerApiConfigured()) {
    try {
      const plan = planFromSubscription(await fetchActiveSubscription(await shopGid(admin)));
      if (plan === "pro") {
        console.info(`Leaf Popups plan for ${shop}: pro (Partner API)`);
        return plan;
      }
    } catch (error) {
      console.error(`Partner API plan check failed for ${shop}`, error);
    }
  } else {
    console.warn("Shopify Partner API credentials are not configured; checking the plan through the Admin API.");
  }
  const plan = await planFromAdmin(admin);
  console.info(`Leaf Popups plan for ${shop}: ${plan} (Admin API)`);
  return plan;
}

export async function syncPlanFromAdmin(admin: AdminClient, shop: string): Promise<PlanSnapshot> {
  const plan = await resolvePlan(admin, shop);
  const existing = await prisma.shopBilling.findUnique({ where: { shop } });
  const unpublishedNames = plan === "pro" ? "[]" : (existing?.unpublishedNames ?? "[]");
  const row = await prisma.shopBilling.upsert({
    where: { shop },
    create: {
      shop,
      plan,
      status: plan,
      unpublishedNames,
      checkedAt: new Date(),
    },
    update: {
      plan,
      status: plan,
      unpublishedNames,
      checkedAt: new Date(),
    },
  });
  return snapshot(row);
}

export async function getShopPlan(
  admin: AdminClient,
  shop: string,
  options?: { force?: boolean },
): Promise<PlanSnapshot> {
  if (proUnlocked()) return { plan: "pro", unpublished: [] };
  const cached = await prisma.shopBilling.findUnique({ where: { shop } });
  const fresh = cached != null && Date.now() - cached.checkedAt.getTime() < PLAN_STALE_MS;
  let current: PlanSnapshot;
  // Free limits only need re-checking when the plan may have changed, not on every admin page load.
  let refreshed = Boolean(options?.force) || cached == null;
  if (cached && fresh && !options?.force) {
    current = snapshot(cached);
  } else {
    try {
      current = await syncPlanFromAdmin(admin, shop);
      refreshed = true;
    } catch (error) {
      console.error("Unable to refresh the Leaf Popups plan", error);
      if (cached) return snapshot(cached);
      return { plan: "free", unpublished: [] };
    }
  }

  if (current.plan !== "free" || !refreshed) return current;
  try {
    const { enforceFreeLimits } = await import("./entitlements.server");
    const names = await enforceFreeLimits(admin, shop);
    if (names.length) return { ...current, unpublished: names };
  } catch (error) {
    console.error("Unable to apply the Free plan limits", error);
  }
  return current;
}

export async function rememberUnpublished(shop: string, names: string[]): Promise<void> {
  if (!names.length) return;
  await prisma.shopBilling.update({
    where: { shop },
    data: { unpublishedNames: JSON.stringify(names) },
  });
}
