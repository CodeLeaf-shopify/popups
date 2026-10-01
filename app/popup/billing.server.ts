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

export async function syncPlanFromAdmin(admin: AdminClient, shop: string): Promise<PlanSnapshot> {
  const subscription = await fetchActiveSubscription(await shopGid(admin));
  const plan: ShopPlan = planFromSubscription(subscription);
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
  if (cached && fresh && !options?.force) {
    current = snapshot(cached);
  } else if (!partnerApiConfigured()) {
    current = cached ? snapshot(cached) : { plan: "free", unpublished: [] };
  } else {
    try {
      current = await syncPlanFromAdmin(admin, shop);
    } catch (error) {
      console.error("Unable to refresh the Leaf Popups plan", error);
      if (cached) return snapshot(cached);
      return { plan: "free", unpublished: [] };
    }
  }

  if (current.plan !== "free") return current;
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
