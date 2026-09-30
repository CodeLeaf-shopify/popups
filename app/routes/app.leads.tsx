import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
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
  customerId: string;
  name: string;
  email: string;
  popupId: string;
  popupName: string;
  submitted: string;
  code: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
    const captured: Omit<Lead, "popupName">[] = [];
    const popupIds = new Set<string>();
    for (const customer of result.customers.nodes) {
      if (!customer.metafield?.value) continue;
      let state: CustomerState;
      try {
        state = JSON.parse(customer.metafield.value) as CustomerState;
      } catch {
        continue;
      }
      const submissions = new Map<string, string>();
      for (const [popupId, record] of Object.entries(state.popups ?? {})) {
        if (record.submittedAt) submissions.set(popupId, record.submittedAt);
      }
      if (state.consent?.popupId && !submissions.has(state.consent.popupId)) {
        submissions.set(state.consent.popupId, state.consent.at);
      }
      for (const [popupId, submitted] of submissions) {
        popupIds.add(popupId);
        captured.push({
          id: `${customer.id}:${popupId}`,
          customerId: customer.id,
          name: customer.displayName || "Unnamed customer",
          email: customer.defaultEmailAddress?.emailAddress ?? "",
          popupId,
          submitted,
          code: state.codes?.[popupId] ?? "",
        });
      }
    }
    const popups = await prisma.popup.findMany({
      where: { shop: session.shop, id: { in: [...popupIds] } },
      select: { id: true, name: true },
    });
    const popupNames = new Map(popups.map((popup) => [popup.id, popup.name]));
    const leads: Lead[] = captured
      .map((lead) => ({ ...lead, popupName: popupNames.get(lead.popupId) ?? "Unknown popup" }))
      .sort((left, right) => right.submitted.localeCompare(left.submitted));
    return { shop: session.shop, leads, error: null as string | null };
  } catch (error) {
    return {
      shop: session.shop,
      leads: [] as Lead[],
      error: error instanceof Error ? error.message : "Customer leads could not be loaded.",
    };
  }
};

export default function Leads() {
  const { shop, leads, error } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Leads" inlineSize="large">
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
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Customer</s-table-header>
                <s-table-header listSlot="secondary">Email</s-table-header>
                <s-table-header listSlot="labeled">Popup</s-table-header>
                <s-table-header listSlot="labeled">Captured</s-table-header>
                <s-table-header listSlot="labeled">Discount code</s-table-header>
              </s-table-header-row>
              <s-table-body>
              {leads.map((lead) => (
                <s-table-row key={lead.id}>
                  <s-table-cell>
                    <s-link href={customerAdminUrl(shop, lead.customerId)} target="_blank">
                      {lead.name}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{lead.email || "No email"}</s-table-cell>
                  <s-table-cell>
                    <s-link href={`/app/popups/${lead.popupId}`}>{lead.popupName}</s-link>
                  </s-table-cell>
                  <s-table-cell>{formatDate(lead.submitted)}</s-table-cell>
                  <s-table-cell>{lead.code || "—"}</s-table-cell>
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

function customerAdminUrl(shop: string, customerId: string): string {
  return `https://${shop}/admin/customers/${customerId.split("/").pop() ?? ""}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
