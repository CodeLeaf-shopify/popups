import type { ActionFunctionArgs } from "react-router";
import { eraseShopData } from "../privacy/erase-shop.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Idempotent: may run more than once, including after sessions were already removed.
  await eraseShopData(shop);

  return new Response();
};
