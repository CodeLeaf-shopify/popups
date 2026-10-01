import type { Popup } from "@prisma/client";

import prisma from "../db.server";
import type { AdminClient } from "./admin-graphql.server";
import { getShopPlan, rememberUnpublished } from "./billing.server";
import { parseBehavior, parsePayload } from "./parse";
import { FREE_PUBLISHED_LIMIT, proFeatureMessage, publishedLimitMessage, usesProFeatures } from "./plans";
import type { Behavior } from "./types";

function liveBehavior(popup: Popup): Behavior | null {
  try {
    if (popup.compiledPayload) return parsePayload(JSON.parse(popup.compiledPayload)).behavior;
    return parseBehavior(JSON.parse(popup.draftBehavior));
  } catch {
    return null;
  }
}

export async function assertCanPublish(
  admin: AdminClient,
  shop: string,
  popupId: string,
  behavior: Behavior,
): Promise<string | null> {
  const plan = await getShopPlan(admin, shop);
  if (plan.plan === "pro") return null;
  if (usesProFeatures(behavior)) return proFeatureMessage();
  const current = await prisma.popup.findFirst({
    where: { id: popupId, shop },
    select: { status: true },
  });
  if (current?.status === "published") return null;
  const published = await prisma.popup.count({ where: { shop, status: "published", NOT: { id: popupId } } });
  if (published >= FREE_PUBLISHED_LIMIT) return publishedLimitMessage();
  return null;
}

async function manifestStillSplitsTests(shop: string): Promise<boolean> {
  const publication = await prisma.publication.findUnique({ where: { shop }, select: { manifest: true } });
  if (!publication?.manifest) return false;
  try {
    const parsed = JSON.parse(publication.manifest) as { campaigns?: { testId?: string }[] };
    return Boolean(parsed.campaigns?.some((campaign) => campaign.testId));
  } catch {
    return false;
  }
}

export async function enforceFreeLimits(admin: AdminClient, shop: string): Promise<string[]> {
  const { endRunningTestsForFreePlan } = await import("./experiments.server");
  const endedNames = await endRunningTestsForFreePlan(shop);
  const popups = await prisma.popup.findMany({ where: { shop, status: "published" } });
  const ranked = popups.map((popup) => {
    const behavior = liveBehavior(popup);
    return {
      popup,
      pro: behavior ? usesProFeatures(behavior) : true,
      priority: behavior?.priority ?? 0,
    };
  });
  const freeSafe = ranked
    .filter((entry) => !entry.pro)
    .sort((left, right) => right.priority - left.priority || right.popup.updatedAt.getTime() - left.popup.updatedAt.getTime());
  const keep = new Set(freeSafe.slice(0, FREE_PUBLISHED_LIMIT).map((entry) => entry.popup.id));
  const drop = ranked.filter((entry) => !keep.has(entry.popup.id));
  const splitLeft = await manifestStillSplitsTests(shop);
  const runningLeft = await prisma.popupTest.count({ where: { shop, status: "running" } });
  if (!drop.length && !endedNames.length && !(splitLeft && runningLeft === 0)) return [];

  if (drop.length) {
    await prisma.popup.updateMany({
      where: { id: { in: drop.map((entry) => entry.popup.id) }, shop },
      data: { status: "draft" },
    });
  }
  const { syncManifest } = await import("./publish.server");
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) throw new Error(synced.error);
  const names = [...endedNames, ...drop.map((entry) => entry.popup.name)];
  await rememberUnpublished(shop, names);
  return names;
}
