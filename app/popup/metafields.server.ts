import {
  CUSTOMER_STATE_KEY,
  NAMESPACE,
  SHOP_MANIFEST_KEY,
  type CustomerState,
  type Manifest,
} from "./types";
import { adminGraphql, formatUserErrors, type AdminClient } from "./admin-graphql.server";

const DEFINITION_CREATE = `#graphql
  mutation LeafPopupsMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation LeafPopupsMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const SHOP_ID = `#graphql
  query LeafPopupsShopId {
    shop { id }
  }
`;

const CUSTOMER_STATE = `#graphql
  query LeafPopupsCustomerState($id: ID!) {
    customer(id: $id) {
      id
      metafield(namespace: "${NAMESPACE}", key: "${CUSTOMER_STATE_KEY}") {
        value
      }
    }
  }
`;

function ignoredDefinitionError(message: string, code?: string): boolean {
  if (code === "TAKEN") return true;
  const normalized = message.toLowerCase();
  return normalized.includes("already exists") || normalized.includes("in use") || normalized.includes("taken");
}

async function createDefinition(
  admin: AdminClient,
  ownerType: "CUSTOMER" | "SHOP",
  key: string,
  name: string,
): Promise<void> {
  const data = await adminGraphql<{
    metafieldDefinitionCreate: {
      userErrors: { message: string; code?: string }[];
    };
  }>(admin, DEFINITION_CREATE, {
    definition: {
      name,
      namespace: NAMESPACE,
      key,
      type: "json",
      ownerType,
      access: { storefront: "PUBLIC_READ" },
    },
  });
  const errors = data.metafieldDefinitionCreate.userErrors.filter(
    (error) => !ignoredDefinitionError(error.message, error.code),
  );
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
}

export async function ensureMetafieldDefinitions(admin: AdminClient): Promise<void> {
  await createDefinition(admin, "CUSTOMER", CUSTOMER_STATE_KEY, "Leaf Popups state");
  await createDefinition(admin, "SHOP", SHOP_MANIFEST_KEY, "Leaf Popups manifest");
}

// A shop's GID never changes, so look it up once per process.
const shopGids = new Map<string, string>();

export async function shopGid(admin: AdminClient, shop: string): Promise<string> {
  const cached = shopGids.get(shop);
  if (cached) return cached;
  const data = await adminGraphql<{ shop: { id: string } }>(admin, SHOP_ID);
  shopGids.set(shop, data.shop.id);
  return data.shop.id;
}

export async function writeShopManifest(
  admin: AdminClient,
  shop: string,
  manifest: Manifest,
): Promise<void> {
  const ownerId = await shopGid(admin, shop);
  const data = await adminGraphql<{
    metafieldsSet: { userErrors: { message: string }[] };
  }>(admin, METAFIELDS_SET, {
    metafields: [
      {
        ownerId,
        namespace: NAMESPACE,
        key: SHOP_MANIFEST_KEY,
        type: "json",
        value: JSON.stringify(manifest),
      },
    ],
  });
  const error = formatUserErrors(data.metafieldsSet.userErrors);
  if (error) throw new Error(error);
}

export async function readCustomerState(
  admin: AdminClient,
  customerId: string,
): Promise<CustomerState> {
  const data = await adminGraphql<{
    customer: { metafield: { value: string } | null } | null;
  }>(admin, CUSTOMER_STATE, { id: customerId });
  const value = data.customer?.metafield?.value;
  if (!value) return { popups: {}, codes: {} };
  const parsed = JSON.parse(value) as CustomerState;
  return {
    popups: parsed.popups ?? {},
    codes: parsed.codes ?? {},
    consent: parsed.consent,
  };
}

const METAFIELDS_DELETE = `#graphql
  mutation LeafPopupsMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

export async function deleteCustomerState(admin: AdminClient, customerId: string): Promise<void> {
  const data = await adminGraphql<{
    metafieldsDelete: { userErrors: { message: string }[] };
  }>(admin, METAFIELDS_DELETE, {
    metafields: [{ ownerId: customerId, namespace: NAMESPACE, key: CUSTOMER_STATE_KEY }],
  });
  const error = formatUserErrors(data.metafieldsDelete.userErrors);
  if (error) throw new Error(error);
}

export async function writeCustomerState(
  admin: AdminClient,
  customerId: string,
  state: CustomerState,
): Promise<void> {
  const data = await adminGraphql<{
    metafieldsSet: { userErrors: { message: string }[] };
  }>(admin, METAFIELDS_SET, {
    metafields: [
      {
        ownerId: customerId,
        namespace: NAMESPACE,
        key: CUSTOMER_STATE_KEY,
        type: "json",
        value: JSON.stringify(state),
      },
    ],
  });
  const error = formatUserErrors(data.metafieldsSet.userErrors);
  if (error) throw new Error(error);
}
