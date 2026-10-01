import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getShopPlan } from "../popup/billing.server";
import { popupStats } from "../popup/stats.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getShopPlan(admin, session.shop);
  if (plan.plan !== "pro") return { locked: true as const };
  const stats = await popupStats(session.shop);
  return { locked: false as const, ...stats };
};

export default function StatsPage() {
  const data = useLoaderData<typeof loader>();

  if (data.locked) {
    return (
      <s-page heading="Stats">
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
    <s-page heading="Stats">
      <s-stack direction="block" gap="base">
        <s-section heading="Last 30 days">
          <s-paragraph>
            {data.totals.views} views, {data.totals.clicks} clicks, {data.totals.submits} submits,{" "}
            {data.totals.dismissals} dismissals.
          </s-paragraph>
        </s-section>
        <s-section heading="Popups">
          {data.rows.length === 0 ? (
            <s-paragraph>No popups yet. Stats appear here after a popup is published.</s-paragraph>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Popup</s-table-header>
                <s-table-header listSlot="labeled">Views</s-table-header>
                <s-table-header listSlot="labeled">Clicks</s-table-header>
                <s-table-header listSlot="labeled">Submits</s-table-header>
                <s-table-header listSlot="labeled">Dismissals</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.rows.map((row) => (
                  <s-table-row key={row.id}>
                    <s-table-cell>
                      {row.available ? <s-link href={`/app/popups/${row.id}`}>{row.name}</s-link> : row.name}
                    </s-table-cell>
                    <s-table-cell>{row.views}</s-table-cell>
                    <s-table-cell>{row.clicks}</s-table-cell>
                    <s-table-cell>{row.submits}</s-table-cell>
                    <s-table-cell>{row.dismissals}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
