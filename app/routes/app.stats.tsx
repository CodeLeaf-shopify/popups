import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { OutcomesChart, SubmitRateBars, TrafficChart } from "../components/AnalyticsCharts";
import { getShopPlan } from "../popup/billing.server";
import {
  ANALYTICS_RANGES,
  analyticsSnapshot,
  parseAnalyticsRange,
  type AnalyticsLeading,
  type AnalyticsTestReadout,
  type AnalyticsVariant,
} from "../popup/stats.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getShopPlan(admin, session.shop);
  if (plan.plan !== "pro") return { locked: true as const };
  const days = parseAnalyticsRange(new URL(request.url).searchParams.get("range"));
  const stats = await analyticsSnapshot(session.shop, days);
  return { locked: false as const, ...stats };
};

export default function StatsPage() {
  const data = useLoaderData<typeof loader>();

  if (data.locked) {
    return (
      <s-page heading="Analytics">
        <s-section heading="Pro">
          <s-stack direction="block" gap="base">
            <s-paragraph>Views, clicks, submits, and dismissals are part of the Pro plan.</s-paragraph>
            <s-button variant="primary" href="/app/plans">
              View plans
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Analytics" inlineSize="large">
      <s-query-container>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-text color="subdued">Last {data.days} days</s-text>
            <s-button-group gap="none" accessibilityLabel="Date range">
              {ANALYTICS_RANGES.map((range) => (
                <s-button key={range} href={`/app/stats?range=${range}`} variant={data.days === range ? "primary" : "secondary"}>
                  {range} days
                </s-button>
              ))}
            </s-button-group>
          </s-stack>
          {data.rows.length === 0 ? (
            <s-section heading="Popups">
              <s-paragraph>No popups yet. Stats appear here after a popup is published.</s-paragraph>
            </s-section>
          ) : (
            <s-stack direction="block" gap="base">
              <s-grid
                gridTemplateColumns="@container (inline-size > 900px) repeat(4, minmax(0, 1fr)), repeat(2, minmax(0, 1fr))"
                gap="base"
              >
                <MetricCard label="Views" value={formatCount(data.totals.views)} change={data.viewsChange} days={data.days} />
                <MetricCard
                  label="Click rate"
                  value={formatRate(data.rates.click)}
                  detail={formatNoun(data.totals.clicks, "click")}
                  change={data.clickRateChange}
                  days={data.days}
                />
                <MetricCard
                  label="Submit rate"
                  value={formatRate(data.rates.submit)}
                  detail={formatNoun(data.totals.submits, "submit")}
                  change={data.submitRateChange}
                  days={data.days}
                />
                <MetricCard
                  label="Dismiss rate"
                  value={formatRate(data.rates.dismiss)}
                  detail={formatNoun(data.totals.dismissals, "dismissal", "dismissals")}
                  change={data.dismissRateChange}
                  days={data.days}
                />
              </s-grid>
              <s-grid
                gridTemplateColumns="@container (inline-size > 800px) minmax(0, 1fr) minmax(0, 1fr), minmax(0, 1fr)"
                gap="base"
              >
                <s-section heading="Traffic">
                  <TrafficChart series={data.series} />
                </s-section>
                <s-section heading="Outcomes">
                  <OutcomesChart series={data.series} />
                </s-section>
              </s-grid>
              <s-section heading="Popups">
                <s-table variant="auto">
                  <s-table-header-row>
                    <s-table-header listSlot="primary">Popup</s-table-header>
                    <s-table-header listSlot="labeled">Views</s-table-header>
                    <s-table-header listSlot="labeled">Clicks</s-table-header>
                    <s-table-header listSlot="labeled">Click rate</s-table-header>
                    <s-table-header listSlot="labeled">Submits</s-table-header>
                    <s-table-header listSlot="labeled">Submit rate</s-table-header>
                    <s-table-header listSlot="labeled">Dismissals</s-table-header>
                    <s-table-header listSlot="labeled">Dismiss rate</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {data.rows.map((row) => (
                      <s-table-row key={row.id}>
                        <s-table-cell>
                          {row.available ? <s-link href={`/app/popups/${row.id}`}>{row.name}</s-link> : row.name}
                        </s-table-cell>
                        <s-table-cell>{formatCount(row.views)}</s-table-cell>
                        <s-table-cell>{formatCount(row.clicks)}</s-table-cell>
                        <s-table-cell>{formatRate(row.clickRate)}</s-table-cell>
                        <s-table-cell>{formatCount(row.submits)}</s-table-cell>
                        <s-table-cell>{formatRate(row.submitRate)}</s-table-cell>
                        <s-table-cell>{formatCount(row.dismissals)}</s-table-cell>
                        <s-table-cell>{formatRate(row.dismissRate)}</s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              </s-section>
              <s-section heading="Tests">
                {data.tests.length === 0 ? (
                  <s-paragraph>No running tests. Completed tests appear here when they end in this period.</s-paragraph>
                ) : (
                  <s-stack direction="block" gap="base">
                    {data.tests.map((test) => (
                      <TestCard key={test.id} test={test} />
                    ))}
                  </s-stack>
                )}
              </s-section>
            </s-stack>
          )}
        </s-stack>
      </s-query-container>
    </s-page>
  );
}

function MetricCard({
  label,
  value,
  detail,
  change,
  days,
}: {
  label: string;
  value: string;
  detail?: string;
  change: number | null;
  days: number;
}) {
  return (
    <s-section accessibilityLabel={label}>
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        {detail ? <s-text color="subdued">{detail}</s-text> : null}
        {change != null ? <s-text color="subdued">{formatChange(change, days)}</s-text> : null}
      </s-stack>
    </s-section>
  );
}

function TestCard({ test }: { test: AnalyticsTestReadout }) {
  const openId = openTarget(test);
  const note = test.status === "running" ? callNote(test.leading) : null;
  return (
    <s-box background="subdued" padding="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">{test.status === "running" ? "Running" : "Completed"}</s-text>
            <s-text color="subdued">
              {test.status === "running" ? "Since the test started" : `Winner is ${winnerName(test)}.`}
            </s-text>
          </s-stack>
          {openId ? <s-link href={`/app/popups/${openId}`}>Open</s-link> : null}
        </s-stack>
        <VariantLine variant={test.a} letter="A" badge={badgeFor(test, "a")} />
        <VariantLine variant={test.b} letter="B" badge={badgeFor(test, "b")} />
        <SubmitRateBars a={test.a} b={test.b} />
        {note ? <s-text color="subdued">{note}</s-text> : null}
      </s-stack>
    </s-box>
  );
}

function VariantLine({
  variant,
  letter,
  badge,
}: {
  variant: AnalyticsVariant;
  letter: "A" | "B";
  badge: "leading" | "winner" | null;
}) {
  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      <s-text>{letter} ·</s-text>
      {variant.available ? <s-link href={`/app/popups/${variant.id}`}>{variant.name}</s-link> : <s-text>{variant.name}</s-text>}
      {badge === "leading" ? <s-badge tone="info">Leading</s-badge> : null}
      {badge === "winner" ? <s-badge tone="success">Winner</s-badge> : null}
      <s-text color="subdued">
        {formatNoun(variant.views, "view")}
        {" · "}
        {formatRate(variant.submitRate)} submit rate
      </s-text>
    </s-stack>
  );
}

function badgeFor(test: AnalyticsTestReadout, letter: "a" | "b"): "leading" | "winner" | null {
  const variant = letter === "a" ? test.a : test.b;
  if (test.status === "completed" && test.winnerId === variant.id) return "winner";
  if (test.status === "running" && test.leading === letter) return "leading";
  return null;
}

function callNote(leading: AnalyticsLeading): string | null {
  if (leading === "early") return "Too early to call";
  if (leading === "tie") return "Even submit rate";
  return null;
}

function winnerName(test: AnalyticsTestReadout): string {
  if (test.winnerId === test.a.id) return test.a.name;
  if (test.winnerId === test.b.id) return test.b.name;
  return "the chosen variant";
}

function openTarget(test: AnalyticsTestReadout): string | null {
  const preferred = test.status === "completed" && test.winnerId ? test.winnerId : test.a.id;
  if (preferred === test.a.id && test.a.available) return test.a.id;
  if (preferred === test.b.id && test.b.available) return test.b.id;
  if (test.a.available) return test.a.id;
  if (test.b.available) return test.b.id;
  return null;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatRate(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatChange(change: number, days: number): string {
  const rounded = Math.round(change);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}% vs prior ${days} days`;
}

function formatNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
