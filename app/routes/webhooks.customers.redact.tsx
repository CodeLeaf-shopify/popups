import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type CustomerRedactPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: { id?: number; email?: string };
};

/**
 * No customer-identifying rows are stored in Prisma.
 * Aggregate popup stats are shop/popup scoped, not customer scoped.
 * Shopify removes the customer record (and our metafield) on the platform side.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const body = payload as CustomerRedactPayload;
  const customerId = body.customer?.id;

  console.log(
    `Received ${topic} for ${shop}: customer_id=${customerId ?? "n/a"} (no local customer PII to redact)`,
  );

  return new Response();
};
