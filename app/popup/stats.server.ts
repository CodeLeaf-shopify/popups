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

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export type AnalyticsCounts = {
  views: number;
  clicks: number;
  submits: number;
  dismissals: number;
};

export type AnalyticsRates = {
  click: number | null;
  submit: number | null;
  dismiss: number | null;
};

export type AnalyticsSeriesPoint = AnalyticsCounts & { day: string };

export type AnalyticsPopupRow = PopupStatRow & {
  clickRate: number | null;
  submitRate: number | null;
  dismissRate: number | null;
};

export type AnalyticsVariant = {
  id: string;
  name: string;
  available: boolean;
  views: number;
  submits: number;
  submitRate: number | null;
};

export type AnalyticsLeading = "early" | "a" | "b" | "tie";

export type AnalyticsTestReadout = {
  id: string;
  status: "running" | "completed";
  winnerId: string | null;
  leading: AnalyticsLeading;
  a: AnalyticsVariant;
  b: AnalyticsVariant;
};

export type AnalyticsSnapshot = {
  days: AnalyticsRange;
  totals: AnalyticsCounts;
  rates: AnalyticsRates;
  viewsChange: number | null;
  clickRateChange: number | null;
  submitRateChange: number | null;
  dismissRateChange: number | null;
  series: AnalyticsSeriesPoint[];
  rows: AnalyticsPopupRow[];
  tests: AnalyticsTestReadout[];
};

const LEADING_MIN_VIEWS = 50;

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function daysEnding(end: string, length: number): string[] {
  const days: string[] = [];
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    days.push(addDays(end, -offset));
  }
  return days;
}

function emptyCounts(): AnalyticsCounts {
  return { views: 0, clicks: 0, submits: 0, dismissals: 0 };
}

function addCounts(target: AnalyticsCounts, source: AnalyticsCounts): void {
  target.views += source.views;
  target.clicks += source.clicks;
  target.submits += source.submits;
  target.dismissals += source.dismissals;
}

function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

function ratesOf(counts: AnalyticsCounts): AnalyticsRates {
  return {
    click: rate(counts.clicks, counts.views),
    submit: rate(counts.submits, counts.views),
    dismiss: rate(counts.dismissals, counts.views),
  };
}

function percentChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function rateChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  return percentChange(current, prior);
}

function leadingOf(a: AnalyticsVariant, b: AnalyticsVariant): AnalyticsLeading {
  if (a.views < LEADING_MIN_VIEWS || b.views < LEADING_MIN_VIEWS) return "early";
  const aRate = a.submitRate ?? 0;
  const bRate = b.submitRate ?? 0;
  if (aRate === bRate) return "tie";
  return aRate > bRate ? "a" : "b";
}

function increment(event: StatEvent): { views?: { increment: number }; clicks?: { increment: number }; submits?: { increment: number }; dismissals?: { increment: number } } {
  if (event === "views") return { views: { increment: 1 } };
  if (event === "clicks") return { clicks: { increment: 1 } };
  if (event === "submits") return { submits: { increment: 1 } };
  return { dismissals: { increment: 1 } };
}

function seed(event: StatEvent): AnalyticsCounts {
  return {
    views: event === "views" ? 1 : 0,
    clicks: event === "clicks" ? 1 : 0,
    submits: event === "submits" ? 1 : 0,
    dismissals: event === "dismissals" ? 1 : 0,
  };
}

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  const parsed = Number(value);
  if (parsed === 7 || parsed === 30 || parsed === 90) return parsed;
  return 30;
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

export async function analyticsSnapshot(shop: string, days: AnalyticsRange): Promise<AnalyticsSnapshot> {
  const today = utcDay();
  const currentStart = addDays(today, -(days - 1));
  const priorStart = addDays(currentStart, -days);
  const currentDays = daysEnding(today, days);
  const windowEnd = new Date(`${today}T23:59:59.999Z`);
  const windowStart = new Date(`${currentStart}T00:00:00.000Z`);

  const [stats, popups, tests] = await Promise.all([
    prisma.popupDailyStat.findMany({
      where: { shop, day: { gte: priorStart } },
    }),
    prisma.popup.findMany({
      where: { shop },
      select: { id: true, name: true, status: true },
    }),
    prisma.popupTest.findMany({
      where: {
        shop,
        OR: [
          { status: "running" },
          { status: "completed", endedAt: { gte: windowStart, lte: windowEnd } },
        ],
      },
    }),
  ]);

  const totals = emptyCounts();
  const prior = emptyCounts();
  const byDay = new Map<string, AnalyticsCounts>();
  const byPopup = new Map<string, PopupStatRow>();
  for (const popup of popups) {
    byPopup.set(popup.id, { ...popup, available: true, ...emptyCounts() });
  }
  for (const stat of stats) {
    const bucket = stat.day >= currentStart ? totals : prior;
    addCounts(bucket, stat);
    if (stat.day < currentStart) continue;
    const day = byDay.get(stat.day) ?? emptyCounts();
    addCounts(day, stat);
    byDay.set(stat.day, day);
    const row = byPopup.get(stat.popupId) ?? {
      id: stat.popupId,
      name: "Deleted popup",
      status: "draft",
      available: false,
      ...emptyCounts(),
    };
    addCounts(row, stat);
    byPopup.set(stat.popupId, row);
  }

  const rates = ratesOf(totals);
  const priorRates = ratesOf(prior);
  const series = currentDays.map((day) => ({ day, ...(byDay.get(day) ?? emptyCounts()) }));
  const rows: AnalyticsPopupRow[] = [...byPopup.values()]
    .map((row) => ({
      ...row,
      clickRate: rate(row.clicks, row.views),
      submitRate: rate(row.submits, row.views),
      dismissRate: rate(row.dismissals, row.views),
    }))
    .sort((left, right) => right.views - left.views || left.name.localeCompare(right.name));

  const testIds = tests.map((test) => test.id);
  const variantIds = tests.flatMap((test) => [test.variantAId, test.variantBId]);
  const [testStats, variants] = await Promise.all([
    testIds.length === 0
      ? Promise.resolve([])
      : prisma.popupDailyStat.findMany({ where: { shop, testId: { in: testIds } } }),
    variantIds.length === 0
      ? Promise.resolve([])
      : prisma.popup.findMany({
          where: { shop, id: { in: variantIds } },
          select: { id: true, name: true },
        }),
  ]);
  const variantNames = new Map(variants.map((popup) => [popup.id, popup.name]));
  const countsByTest = new Map<string, Map<string, AnalyticsCounts>>();
  for (const stat of testStats) {
    const byPopupId = countsByTest.get(stat.testId) ?? new Map<string, AnalyticsCounts>();
    const counts = byPopupId.get(stat.popupId) ?? emptyCounts();
    addCounts(counts, stat);
    byPopupId.set(stat.popupId, counts);
    countsByTest.set(stat.testId, byPopupId);
  }

  const readouts = tests.flatMap((test) => {
    const status: "running" | "completed" | null =
      test.status === "running" ? "running" : test.status === "completed" ? "completed" : null;
    if (!status) return [];
    const counts = countsByTest.get(test.id) ?? new Map<string, AnalyticsCounts>();
    const variant = (id: string): AnalyticsVariant => {
      const totalsForVariant = counts.get(id) ?? emptyCounts();
      return {
        id,
        name: variantNames.get(id) ?? "Deleted popup",
        available: variantNames.has(id),
        views: totalsForVariant.views,
        submits: totalsForVariant.submits,
        submitRate: rate(totalsForVariant.submits, totalsForVariant.views),
      };
    };
    const a = variant(test.variantAId);
    const b = variant(test.variantBId);
    const when = (status === "completed" ? test.endedAt : test.startedAt)?.getTime() ?? 0;
    return [{ id: test.id, status, winnerId: test.winnerId, leading: leadingOf(a, b), a, b, when }];
  });
  readouts.sort((left, right) => {
    if (left.status !== right.status) return left.status === "running" ? -1 : 1;
    return right.when - left.when;
  });

  return {
    days,
    totals,
    rates,
    viewsChange: percentChange(totals.views, prior.views),
    clickRateChange: rateChange(rates.click, priorRates.click),
    submitRateChange: rateChange(rates.submit, priorRates.submit),
    dismissRateChange: rateChange(rates.dismiss, priorRates.dismiss),
    series,
    rows,
    tests: readouts.map((test) => ({
      id: test.id,
      status: test.status,
      winnerId: test.winnerId,
      leading: test.leading,
      a: test.a,
      b: test.b,
    })),
  };
}

export async function popupStats(shop: string): Promise<{ rows: PopupStatRow[]; totals: AnalyticsCounts }> {
  const snapshot = await analyticsSnapshot(shop, 30);
  return {
    rows: snapshot.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      available: row.available,
      views: row.views,
      clicks: row.clicks,
      submits: row.submits,
      dismissals: row.dismissals,
    })),
    totals: snapshot.totals,
  };
}
