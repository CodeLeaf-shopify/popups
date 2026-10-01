import prisma from "../db.server";
import { PRO_PLAN } from "../shopify.server";
import { adminGraphql, type AdminClient } from "./admin-graphql.server";
import { PLAN_STALE_MS, type ShopPlan } from "./plans";

const SUBSCRIPTION_QUERY = `#graphql
  query LeafPopupsSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
      }
    }
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

type SubscriptionNode = {
  id: string;
  name: string;
  status: string;
  test: boolean;
};

export type PlanSnapshot = {
  plan: ShopPlan;
  subscriptionId: string | null;
  test: boolean;
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

function snapshot(row: {
  plan: string;
  subscriptionId: string | null;
  test: boolean;
  unpublishedNames: string;
}): PlanSnapshot {
  return {
    plan: row.plan === "pro" ? "pro" : "free",
    subscriptionId: row.subscriptionId,
    test: row.test,
    unpublished: parseNames(row.unpublishedNames),
  };
}

export async function shopIsDevelopment(admin: AdminClient): Promise<boolean> {
  const data = await adminGraphql<{ shop: { plan: { partnerDevelopment: boolean } } }>(admin, SHOP_PLAN_QUERY);
  return data.shop.plan.partnerDevelopment === true;
}

export function plansReturnUrl(): string {
  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  return `${base}/app/plans`;
}

export async function syncPlanFromAdmin(admin: AdminClient, shop: string): Promise<PlanSnapshot> {
  const data = await adminGraphql<{
    currentAppInstallation: { activeSubscriptions: SubscriptionNode[] };
  }>(admin, SUBSCRIPTION_QUERY);
  const active = data.currentAppInstallation.activeSubscriptions.find(
    (subscription) => subscription.name === PRO_PLAN && subscription.status === "ACTIVE",
  );
  const plan: ShopPlan = active ? "pro" : "free";
  const existing = await prisma.shopBilling.findUnique({ where: { shop } });
  const unpublishedNames = plan === "pro" ? "[]" : (existing?.unpublishedNames ?? "[]");
  const row = await prisma.shopBilling.upsert({
    where: { shop },
    create: {
      shop,
      plan,
      subscriptionId: active?.id ?? null,
      status: active?.status ?? "INACTIVE",
      test: active?.test ?? false,
      unpublishedNames,
      checkedAt: new Date(),
    },
    update: {
      plan,
      subscriptionId: active?.id ?? null,
      status: active?.status ?? existing?.status ?? "INACTIVE",
      test: active?.test ?? false,
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
  const cached = await prisma.shopBilling.findUnique({ where: { shop } });
  const fresh = cached != null && Date.now() - cached.checkedAt.getTime() < PLAN_STALE_MS;
  let current: PlanSnapshot;
  if (cached && fresh && !options?.force) {
    current = snapshot(cached);
  } else {
    try {
      current = await syncPlanFromAdmin(admin, shop);
    } catch (error) {
      console.error("Unable to refresh the Leaf Popups plan", error);
      if (cached) return snapshot(cached);
      return { plan: "free", subscriptionId: null, test: false, unpublished: [] };
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
