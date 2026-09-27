import prisma from "../db.server";
import { adminGraphql, formatUserErrors, type AdminClient } from "./admin-graphql.server";
import { createSharedDiscount, discountCode } from "./discounts.server";
import { readCustomerState, writeCustomerState } from "./metafields.server";
import { parseBehavior } from "./parse";
import { emptyCustomerState, type CustomerState } from "./types";

const FIND_CUSTOMER = `#graphql
  query LeafPopupsFindCustomer($query: String!) {
    customers(first: 1, query: $query) {
      nodes { id }
    }
  }
`;

const CREATE_CUSTOMER = `#graphql
  mutation LeafPopupsCreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

export type SubmitInput = {
  popupId: string;
  email?: string;
  consent?: boolean;
  claim?: boolean;
  loggedInCustomerId?: string | null;
};

export type SubmitResult =
  | { ok: true; state: CustomerState; code?: string; message: string }
  | { ok: false; error: string };

function customerGid(loggedInId: string): string {
  return loggedInId.startsWith("gid://") ? loggedInId : `gid://shopify/Customer/${loggedInId}`;
}

function mergeState(current: CustomerState, popupId: string, patch: CustomerState["popups"][string], extra?: Partial<CustomerState>): CustomerState {
  return {
    popups: {
      ...current.popups,
      [popupId]: { ...current.popups[popupId], ...patch },
    },
    codes: extra?.codes ?? current.codes,
    consent: extra?.consent ?? current.consent,
  };
}

async function findOrCreateCustomer(admin: AdminClient, email: string, consent: boolean): Promise<string> {
  const found = await adminGraphql<{ customers: { nodes: { id: string }[] } }>(admin, FIND_CUSTOMER, {
    query: `email:${email}`,
  });
  const existing = found.customers.nodes[0]?.id;
  if (existing) return existing;

  const input: Record<string, unknown> = { email };
  if (consent) {
    input.emailMarketingConsent = {
      marketingState: "SUBSCRIBED",
      marketingOptInLevel: "SINGLE_OPT_IN",
      consentUpdatedAt: new Date().toISOString(),
    };
  }
  const created = await adminGraphql<{
    customerCreate: { customer: { id: string } | null; userErrors: { message: string }[] };
  }>(admin, CREATE_CUSTOMER, { input });
  const error = formatUserErrors(created.customerCreate.userErrors);
  if (error) throw new Error(error);
  const id = created.customerCreate.customer?.id;
  if (!id) throw new Error("Shopify did not create the customer.");
  return id;
}

export async function recordPopupEvent(
  admin: AdminClient,
  shop: string,
  popupId: string,
  loggedInCustomerId: string | null,
  event: "shown" | "dismissed",
): Promise<SubmitResult> {
  if (!loggedInCustomerId) return { ok: true, state: emptyCustomerState(), message: "Stored in the browser." };
  const popup = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!popup) return { ok: false, error: "Unknown popup." };
  const customerId = customerGid(loggedInCustomerId);
  const now = new Date().toISOString();
  const current = await readCustomerState(admin, customerId);
  const state = mergeState(current, popupId, event === "shown" ? { lastShown: now } : { dismissedAt: now });
  await writeCustomerState(admin, customerId, state);
  return { ok: true, state, message: "Saved." };
}

export async function submitPopup(
  admin: AdminClient,
  shop: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  const popup = await prisma.popup.findFirst({ where: { id: input.popupId, shop, status: "published" } });
  if (!popup) return { ok: false, error: "This popup is not published." };
  const behavior = parseBehavior(JSON.parse(popup.draftBehavior));
  const email = input.email?.trim().toLowerCase();
  if (email && !email.includes("@")) return { ok: false, error: "Enter a valid email." };

  let customerId: string | null = input.loggedInCustomerId ? customerGid(input.loggedInCustomerId) : null;
  if (!customerId && email) {
    customerId = await findOrCreateCustomer(admin, email, Boolean(input.consent));
  }
  if (!customerId) {
    return { ok: false, error: "Enter an email or sign in so we can save this." };
  }

  const now = new Date().toISOString();
  const current = await readCustomerState(admin, customerId);
  let code = current.codes[popup.id];
  if (behavior.goal === "discount" && behavior.discount?.mode === "unique" && !code) {
    code = discountCode();
    await createSharedDiscount(
      admin,
      `Leaf Popups ${popup.name} ${code}`,
      code,
      behavior.discount.percentage,
    );
  }
  if (behavior.goal === "discount" && behavior.discount?.mode === "shared") {
    code = behavior.discount.code ?? code;
  }

  const codes = code ? { ...current.codes, [popup.id]: code } : current.codes;
  const state = mergeState(
    current,
    popup.id,
    { submittedAt: now, lastShown: current.popups[popup.id]?.lastShown ?? now },
    {
      codes,
      consent:
        input.consent && email
          ? { at: now, popupId: popup.id }
          : current.consent,
    },
  );
  await writeCustomerState(admin, customerId, state);
  return {
    ok: true,
    state,
    code,
    message: code ? "You're in. Here's your code." : "You're on the list.",
  };
}
