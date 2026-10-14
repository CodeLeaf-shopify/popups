import type { ActionFunctionArgs } from "react-router";
import { deleteCustomerState } from "../popup/metafields.server";
import { authenticate, unauthenticated } from "../shopify.server";

type CustomerRedactPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: { id?: number; email?: string };
};

/**
 * No customer-identifying rows are stored in Prisma.
 * Aggregate popup stats are shop/popup scoped, not customer scoped.
 * The only customer data the app writes is the leaf_popups.state metafield, which is cleared here.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const body = payload as CustomerRedactPayload;
  const customerId = body.customer?.id;

  console.log(`Received ${topic} for ${shop}: customer_id=${customerId ?? "n/a"}`);

  if (customerId) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      await deleteCustomerState(admin, `gid://shopify/Customer/${customerId}`);
    } catch (error) {
      // The customer may already be deleted, or the shop uninstalled; nothing else is held locally.
      console.error(`Unable to clear Leaf Popups state for customer ${customerId} on ${shop}`, error);
    }
  }

  return new Response();
};
