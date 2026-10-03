import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type DataRequestPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: { id?: number; email?: string };
  data_request?: { id?: number };
};

/**
 * Leaf Popups does not store customer PII in its own database.
 * Engagement, consent, and emails live on Shopify customers / metafields.
 * Acknowledge the request so the merchant can fulfill it from Shopify Admin.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const body = payload as DataRequestPayload;
  const customerId = body.customer?.id;
  const requestId = body.data_request?.id;

  console.log(
    `Received ${topic} for ${shop}: data_request=${requestId ?? "n/a"} customer_id=${customerId ?? "n/a"} (no local customer PII to export)`,
  );

  return new Response();
};
