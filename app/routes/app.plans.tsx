import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getShopPlan, plansReturnUrl, shopIsDevelopment } from "../popup/billing.server";
import { enforceFreeLimits } from "../popup/entitlements.server";
import { FREE_PUBLISHED_LIMIT, PRO_PRICE_LABEL } from "../popup/plans";
import { authenticate, PRO_PLAN } from "../shopify.server";
import prisma from "../db.server";

type PlanAction =
  | { ok: true; plan: "free" | "pro"; unpublished: string[] }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [plan, development] = await Promise.all([
    getShopPlan(admin, session.shop, { force: true }),
    shopIsDevelopment(admin).catch(() => false),
  ]);
  return { plan: plan.plan, unpublished: plan.unpublished, development };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<PlanAction> => {
  const { admin, billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    if (intent === "upgrade") {
      await billing.request({
        plan: PRO_PLAN,
        isTest: await shopIsDevelopment(admin),
        returnUrl: plansReturnUrl(),
      });
    }

    if (intent === "downgrade") {
      const current = await getShopPlan(admin, session.shop, { force: true });
      if (current.plan === "pro" && current.subscriptionId) {
        await billing.cancel({
          subscriptionId: current.subscriptionId,
          prorate: true,
          isTest: current.test,
        });
      }
      await prisma.shopBilling.upsert({
        where: { shop: session.shop },
        create: {
          shop: session.shop,
          plan: "free",
          subscriptionId: null,
          status: "CANCELLED",
          test: false,
          checkedAt: new Date(),
        },
        update: {
          plan: "free",
          subscriptionId: null,
          status: "CANCELLED",
          checkedAt: new Date(),
        },
      });
      const unpublished = await enforceFreeLimits(admin, session.shop);
      return { ok: true, plan: "free", unpublished };
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Shopify could not update the subscription.",
    };
  }

  return { ok: false, error: "Choose a plan." };
};

export default function PlansPage() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data;
  const plan = result?.ok ? result.plan : loaderData.plan;
  const unpublished = result?.ok && result.unpublished.length ? result.unpublished : loaderData.unpublished;
  const busy = fetcher.state !== "idle";
  const pro = plan === "pro";

  return (
    <s-page heading="Plans">
      <s-stack direction="block" gap="base">
        {result && !result.ok ? <s-banner tone="critical">{result.error}</s-banner> : null}
        {unpublished.length ? (
          <s-banner tone="warning" heading="Some popups were unpublished">
            The Free plan keeps {FREE_PUBLISHED_LIMIT} published popups and leaves out Pro features. Unpublished:{" "}
            {unpublished.join(", ")}.
          </s-banner>
        ) : null}
        {loaderData.development ? (
          <s-banner tone="info">This development store uses a test charge. Shopify does not bill the card.</s-banner>
        ) : null}
        <s-grid gridTemplateColumns="@container (inline-size > 700px) 1fr 1fr, 1fr" gap="base">
          <s-section heading="Free">
            <s-stack direction="block" gap="base">
              {!pro ? <s-badge tone="success">Current plan</s-badge> : null}
              <s-unordered-list>
                <s-list-item>Unlimited drafts</s-list-item>
                <s-list-item>Up to {FREE_PUBLISHED_LIMIT} published popups</s-list-item>
                <s-list-item>Immediate, delay, and scroll triggers</s-list-item>
                <s-list-item>One shared discount code</s-list-item>
                <s-list-item>Email capture, path rules, and frequency</s-list-item>
              </s-unordered-list>
              {pro ? (
                <s-button
                  {...(busy ? { loading: true } : {})}
                  onClick={() => fetcher.submit({ intent: "downgrade" }, { method: "POST" })}
                >
                  Downgrade to Free
                </s-button>
              ) : null}
              {pro ? (
                <s-paragraph>
                  Downgrading unpublishes Pro features and keeps the {FREE_PUBLISHED_LIMIT} highest-priority popups that
                  still fit the Free plan. Designs stay in your drafts.
                </s-paragraph>
              ) : null}
            </s-stack>
          </s-section>
          <s-section heading="Pro">
            <s-stack direction="block" gap="base">
              {pro ? <s-badge tone="success">Current plan</s-badge> : null}
              <s-paragraph>{PRO_PRICE_LABEL}</s-paragraph>
              <s-unordered-list>
                <s-list-item>Unlimited published popups</s-list-item>
                <s-list-item>Exit intent</s-list-item>
                <s-list-item>Start and end schedule</s-list-item>
                <s-list-item>Show a popup on desktop or mobile only</s-list-item>
                <s-list-item>A unique discount code per subscriber</s-list-item>
                <s-list-item>Views, clicks, submits, and dismissals</s-list-item>
              </s-unordered-list>
              {pro ? null : (
                <s-button
                  variant="primary"
                  {...(busy ? { loading: true } : {})}
                  onClick={() => fetcher.submit({ intent: "upgrade" }, { method: "POST" })}
                >
                  Upgrade to Pro
                </s-button>
              )}
            </s-stack>
          </s-section>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
