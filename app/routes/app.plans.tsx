import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getShopPlan } from "../popup/billing.server";
import { planSelectionUrl } from "../popup/partner-api.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, redirect, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (url.searchParams.has("plan_handle")) {
    await getShopPlan(admin, session.shop, { force: true });
    return redirect("/app/popups");
  }
  return redirect(planSelectionUrl(session.shop), { target: "_top" });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
