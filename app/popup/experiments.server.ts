import prisma from "../db.server";
import { adminGraphql, type AdminClient } from "./admin-graphql.server";
import {
  fetchActiveSubscription,
  partnerApiConfigured,
  planFromSubscription,
} from "./partner-api.server";
import { publishPopup, syncManifest } from "./publish.server";
import type {
  Behavior,
  EditorDocument,
  ExperimentRow,
  ExperimentVariant,
  PopupExperiment,
  StorefrontPayload,
} from "./types";

const SHOP_ID_QUERY = `#graphql
  query LeafPopupsShopId {
    shop { id }
  }
`;

const PRO_REQUIRED = "A/B tests are part of the Pro plan.";

function emptyCounts(): Pick<ExperimentRow, "views" | "clicks" | "submits" | "dismissals"> {
  return { views: 0, clicks: 0, submits: 0, dismissals: 0 };
}

export async function runningTestForPopup(shop: string, popupId: string) {
  return prisma.popupTest.findFirst({
    where: {
      shop,
      status: "running",
      OR: [{ variantAId: popupId }, { variantBId: popupId }],
    },
  });
}

async function assertPartnerPro(admin: AdminClient, shop: string): Promise<string | null> {
  if (!partnerApiConfigured()) return PRO_REQUIRED;
  try {
    const data = await adminGraphql<{ shop: { id: string } }>(admin, SHOP_ID_QUERY);
    const subscription = await fetchActiveSubscription(data.shop.id);
    if (planFromSubscription(subscription) !== "pro") return PRO_REQUIRED;
  } catch (error) {
    console.error("Unable to confirm the Leaf Popups plan for an A/B test", error);
    return PRO_REQUIRED;
  }
  await prisma.shopBilling.upsert({
    where: { shop },
    create: {
      shop,
      plan: "pro",
      status: "pro",
      unpublishedNames: "[]",
      checkedAt: new Date(),
    },
    update: {
      plan: "pro",
      status: "pro",
      unpublishedNames: "[]",
      checkedAt: new Date(),
    },
  });
  return null;
}

export async function experimentForPopup(shop: string, popupId: string): Promise<PopupExperiment | null> {
  const test = await runningTestForPopup(shop, popupId);
  if (!test) return null;
  const [popups, stats] = await Promise.all([
    prisma.popup.findMany({
      where: { shop, id: { in: [test.variantAId, test.variantBId] } },
      select: { id: true, name: true },
    }),
    prisma.popupDailyStat.findMany({ where: { shop, testId: test.id } }),
  ]);
  const names = new Map(popups.map((popup) => [popup.id, popup.name]));
  const totals = new Map<string, Pick<ExperimentRow, "views" | "clicks" | "submits" | "dismissals">>();
  for (const stat of stats) {
    const row = totals.get(stat.popupId) ?? emptyCounts();
    row.views += stat.views;
    row.clicks += stat.clicks;
    row.submits += stat.submits;
    row.dismissals += stat.dismissals;
    totals.set(stat.popupId, row);
  }
  const rows: ExperimentRow[] = (
    [
      ["a", test.variantAId],
      ["b", test.variantBId],
    ] as const
  ).map(([variant, id]) => ({
    id,
    name: names.get(id) ?? "Deleted popup",
    variant,
    ...(totals.get(id) ?? emptyCounts()),
  }));
  return { id: test.id, rows };
}

async function rollbackStart(
  admin: AdminClient,
  shop: string,
  popupId: string,
  variantBId: string,
  testId: string | null,
): Promise<void> {
  if (testId) await prisma.popupTest.delete({ where: { id: testId } }).catch(() => undefined);
  await prisma.popup.update({ where: { id: popupId }, data: { testId: null, variant: null } }).catch(() => undefined);
  await prisma.popup.delete({ where: { id: variantBId } }).catch(() => undefined);
  await syncManifest(admin, shop);
}

export async function startPopupTest(
  admin: AdminClient,
  shop: string,
  popupId: string,
  name: string,
  document: EditorDocument,
  behavior: Behavior,
): Promise<
  | { ok: true; updatedAt: string; payload: StorefrontPayload; behavior: Behavior; experiment: PopupExperiment }
  | { ok: false; error: string }
> {
  const blocked = await assertPartnerPro(admin, shop);
  if (blocked) return { ok: false, error: blocked };
  const existing = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!existing) return { ok: false, error: "Popup not found." };
  if (existing.status !== "published") return { ok: false, error: "Publish this popup before starting a test." };
  if (await runningTestForPopup(shop, popupId)) return { ok: false, error: "This popup is already in a test." };

  const publishedA = await publishPopup(admin, shop, popupId, name, document, behavior);
  if (!publishedA.ok) return publishedA;

  const created = await prisma.popup.create({
    data: {
      shop,
      name: `${name} (B)`,
      template: existing.template,
      status: "draft",
      schemaVersion: document.schemaVersion,
      draftDocument: JSON.stringify(document),
      draftBehavior: JSON.stringify(publishedA.behavior),
    },
  });
  let publishedB: Awaited<ReturnType<typeof publishPopup>>;
  try {
    publishedB = await publishPopup(admin, shop, created.id, created.name, document, publishedA.behavior);
  } catch (error) {
    await rollbackStart(admin, shop, popupId, created.id, null);
    throw error;
  }
  if (!publishedB.ok) {
    await rollbackStart(admin, shop, popupId, created.id, null);
    return publishedB;
  }

  let test: { id: string };
  try {
    test = await prisma.$transaction(async (tx) => {
      const createdTest = await tx.popupTest.create({
        data: { shop, status: "running", variantAId: popupId, variantBId: created.id },
      });
      await tx.popup.update({ where: { id: popupId }, data: { testId: createdTest.id, variant: "a" } });
      await tx.popup.update({ where: { id: created.id }, data: { testId: createdTest.id, variant: "b" } });
      return createdTest;
    });
  } catch (error) {
    await rollbackStart(admin, shop, popupId, created.id, null);
    throw error;
  }
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) {
    await rollbackStart(admin, shop, popupId, created.id, test.id);
    return { ok: false, error: synced.error };
  }
  const experiment = await experimentForPopup(shop, popupId);
  const updated = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!experiment || !updated) {
    await rollbackStart(admin, shop, popupId, created.id, test.id);
    return { ok: false, error: "The test could not be started." };
  }
  return {
    ok: true,
    updatedAt: updated.updatedAt.toISOString(),
    payload: publishedA.payload,
    behavior: publishedA.behavior,
    experiment,
  };
}

export async function chooseTestWinner(
  admin: AdminClient,
  shop: string,
  popupId: string,
  winnerId: string,
): Promise<{ ok: true; updatedAt: string; status: "draft" | "published" } | { ok: false; error: string }> {
  const test = await runningTestForPopup(shop, popupId);
  if (!test) return { ok: false, error: "This popup is not in a running test." };
  if (winnerId !== test.variantAId && winnerId !== test.variantBId) {
    return { ok: false, error: "Choose one of the two variants." };
  }
  const loserId = winnerId === test.variantAId ? test.variantBId : test.variantAId;
  const winnerVariant: ExperimentVariant = winnerId === test.variantAId ? "a" : "b";
  const loserVariant: ExperimentVariant = winnerVariant === "a" ? "b" : "a";
  const [winner, loser] = await Promise.all([
    prisma.popup.findFirst({ where: { id: winnerId, shop, status: "published" } }),
    prisma.popup.findFirst({ where: { id: loserId, shop, status: "published" } }),
  ]);
  if (!winner || !loser) return { ok: false, error: "Choose one of the two variants." };

  await prisma.$transaction([
    prisma.popup.update({ where: { id: loserId }, data: { status: "draft", testId: null, variant: null } }),
    prisma.popup.update({ where: { id: winnerId }, data: { testId: null, variant: null } }),
    prisma.popupTest.update({
      where: { id: test.id },
      data: { status: "completed", winnerId, endedAt: new Date() },
    }),
  ]);
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) {
    await prisma.$transaction([
      prisma.popup.update({
        where: { id: loserId },
        data: { status: "published", testId: test.id, variant: loserVariant },
      }),
      prisma.popup.update({ where: { id: winnerId }, data: { testId: test.id, variant: winnerVariant } }),
      prisma.popupTest.update({
        where: { id: test.id },
        data: { status: "running", winnerId: null, endedAt: null },
      }),
    ]).catch((error) => {
      console.error("Unable to restore an A/B test after a manifest error", error);
    });
    return { ok: false, error: synced.error };
  }
  const current = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!current) return { ok: false, error: "Popup not found." };
  return {
    ok: true,
    updatedAt: current.updatedAt.toISOString(),
    status: current.status === "published" ? "published" : "draft",
  };
}

export async function endRunningTestsForFreePlan(shop: string): Promise<string[]> {
  const running = await prisma.popupTest.findMany({ where: { shop, status: "running" } });
  if (!running.length) return [];
  const names: string[] = [];
  for (const test of running) {
    const [variantA, variantB] = await Promise.all([
      prisma.popup.findFirst({
        where: { id: test.variantAId, shop },
        select: { id: true, name: true, status: true },
      }),
      prisma.popup.findFirst({
        where: { id: test.variantBId, shop },
        select: { id: true, name: true, status: true },
      }),
    ]);
    if (variantB?.status === "published") names.push(variantB.name);
    if (variantB) {
      await prisma.popup.update({
        where: { id: variantB.id },
        data: { status: "draft", testId: null, variant: null },
      });
    }
    if (variantA) {
      await prisma.popup.update({
        where: { id: variantA.id },
        data: { testId: null, variant: null },
      });
    }
    await prisma.popupTest.update({
      where: { id: test.id },
      data: { status: "completed", endedAt: new Date() },
    });
  }
  return names;
}
