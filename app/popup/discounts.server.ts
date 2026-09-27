import { adminGraphql, formatUserErrors, type AdminClient } from "./admin-graphql.server";

const DISCOUNT_CREATE = `#graphql
  mutation LeafPopupsDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

export function discountCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `LEAF${suffix}`;
}

export async function createSharedDiscount(
  admin: AdminClient,
  title: string,
  code: string,
  percentage: number,
): Promise<string> {
  const fraction = Math.min(100, Math.max(1, percentage)) / 100;
  const data = await adminGraphql<{
    discountCodeBasicCreate: {
      codeDiscountNode: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(admin, DISCOUNT_CREATE, {
    basicCodeDiscount: {
      title,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: {
        value: { percentage: fraction },
        items: { all: true },
      },
    },
  });
  const error = formatUserErrors(data.discountCodeBasicCreate.userErrors);
  if (error) throw new Error(error);
  const id = data.discountCodeBasicCreate.codeDiscountNode?.id;
  if (!id) throw new Error("Shopify did not return a discount.");
  return id;
}
