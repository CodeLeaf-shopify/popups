import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { adminGraphql } from "../popup/admin-graphql.server";
import { NAMESPACE, CUSTOMER_STATE_KEY, type CustomerState } from "../popup/types";
import { authenticate } from "../shopify.server";

const LEADS = `#graphql
  query LeafPopupsLeads {
    customers(first: 50, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        displayName
        defaultEmailAddress { emailAddress }
        metafield(namespace: "${NAMESPACE}", key: "${CUSTOMER_STATE_KEY}") { value }
      }
    }
  }
`;

type Lead = {
  id: string;
  name: string;
  email: string;
  submitted: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const result = await adminGraphql<{
      customers: {
        nodes: {
          id: string;
          displayName: string;
          defaultEmailAddress: { emailAddress: string } | null;
          metafield: { value: string } | null;
        }[];
      };
    }>(admin, LEADS);
    const leads: Lead[] = [];
    for (const customer of result.customers.nodes) {
      if (!customer.metafield?.value) continue;
      const state = JSON.parse(customer.metafield.value) as CustomerState;
      const submitted = Object.values(state.popups ?? {}).some((record) => record.submittedAt);
      if (!submitted && !state.consent) continue;
      leads.push({
        id: customer.id,
        name: customer.displayName,
        email: customer.defaultEmailAddress?.emailAddress ?? "",
        submitted: state.consent?.at ?? newestSubmission(state),
      });
    }
    return { leads, error: null as string | null };
  } catch (error) {
    return {
      leads: [] as Lead[],
      error: error instanceof Error ? error.message : "Customer leads could not be loaded.",
    };
  }
};

function newestSubmission(state: CustomerState): string {
  return Object.values(state.popups ?? {}).reduce((latest, record) => {
    if (!record.submittedAt || record.submittedAt < latest) return latest;
    return record.submittedAt;
  }, "");
}

export default function Leads() {
  const { leads, error } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Leads">
      <s-stack direction="block" gap="base">
        {error ? (
          <s-banner tone="warning" heading="Shopify did not return customer details">
            {error} Email capture still writes leaf_popups.state on the customer. Protected customer data
            access is required before a public app can read those emails.
          </s-banner>
        ) : null}
        <s-section heading="Recent customers">
          {leads.length === 0 ? (
            <s-paragraph>No captured customers in the latest 50 customer updates.</s-paragraph>
          ) : (
            <s-stack direction="block" gap="base">
              {leads.map((lead) => (
                <s-stack key={lead.id} direction="inline" gap="base">
                  <s-text>{lead.name}</s-text>
                  <s-text>{lead.email}</s-text>
                  <s-text>{lead.submitted}</s-text>
                </s-stack>
              ))}
            </s-stack>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
