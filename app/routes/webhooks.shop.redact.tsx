import type { ActionFunctionArgs } from "react-router";
import { eraseShopData } from "../privacy/erase-shop.server";
import { authenticate } from "../shopify.server";

/**
 * Sent ~48 hours after uninstall. Erase any remaining shop-scoped app data.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await eraseShopData(shop);
  return new Response();
};
