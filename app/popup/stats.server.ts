import prisma from "../db.server";

export type StatEvent = "views" | "clicks" | "submits" | "dismissals";

export type PopupStatRow = {
  id: string;
  name: string;
  status: string;
  available: boolean;
  views: number;
  clicks: number;
  submits: number;
  dismissals: number;
};

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function increment(event: StatEvent): { views?: { increment: number }; clicks?: { increment: number }; submits?: { increment: number }; dismissals?: { increment: number } } {
  if (event === "views") return { views: { increment: 1 } };
  if (event === "clicks") return { clicks: { increment: 1 } };
  if (event === "submits") return { submits: { increment: 1 } };
  return { dismissals: { increment: 1 } };
}

function seed(event: StatEvent): { views: number; clicks: number; submits: number; dismissals: number } {
  return {
    views: event === "views" ? 1 : 0,
    clicks: event === "clicks" ? 1 : 0,
    submits: event === "submits" ? 1 : 0,
    dismissals: event === "dismissals" ? 1 : 0,
  };
}

export async function recordPopupStat(shop: string, popupId: string, event: StatEvent): Promise<void> {
  const popup = await prisma.popup.findFirst({
    where: { id: popupId, shop, status: "published" },
    select: { id: true, testId: true },
  });
  if (!popup) return;
  let testId = "";
  if (popup.testId) {
    const test = await prisma.popupTest.findFirst({
      where: { id: popup.testId, shop, status: "running" },
      select: { id: true },
    });
    if (test) testId = test.id;
  }
  const day = utcDay();
  await prisma.popupDailyStat.upsert({
    where: { shop_popupId_day_testId: { shop, popupId, day, testId } },
    create: { shop, popupId, day, testId, ...seed(event) },
    update: increment(event),
  });
}

export async function popupStats(shop: string): Promise<{ rows: PopupStatRow[]; totals: Pick<PopupStatRow, "views" | "clicks" | "submits" | "dismissals"> }> {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  const [stats, popups] = await Promise.all([
    prisma.popupDailyStat.findMany({
      where: { shop, day: { gte: utcDay(start) } },
    }),
    prisma.popup.findMany({
      where: { shop },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const totals = { views: 0, clicks: 0, submits: 0, dismissals: 0 };
  const byPopup = new Map<string, PopupStatRow>();
  for (const popup of popups) {
    byPopup.set(popup.id, { ...popup, available: true, views: 0, clicks: 0, submits: 0, dismissals: 0 });
  }
  for (const stat of stats) {
    const row = byPopup.get(stat.popupId) ?? {
      id: stat.popupId,
      name: "Deleted popup",
      status: "draft",
      available: false,
      views: 0,
      clicks: 0,
      submits: 0,
      dismissals: 0,
    };
    row.views += stat.views;
    row.clicks += stat.clicks;
    row.submits += stat.submits;
    row.dismissals += stat.dismissals;
    byPopup.set(stat.popupId, row);
    totals.views += stat.views;
    totals.clicks += stat.clicks;
    totals.submits += stat.submits;
    totals.dismissals += stat.dismissals;
  }
  return { rows: [...byPopup.values()], totals };
}
