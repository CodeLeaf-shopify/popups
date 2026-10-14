import type { ActionFunctionArgs } from "react-router";

import { getShopPlan } from "../popup/billing.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Acknowledge right away; the plan sync calls the Partner and Admin APIs and can exceed Shopify's 5s webhook timeout.
  void unauthenticated
    .admin(shop)
    .then(({ admin }) => getShopPlan(admin, shop, { force: true }))
    .catch((error) => {
      console.error(`Unable to sync the Leaf Popups plan for ${shop}`, error);
    });

  return new Response();
};
