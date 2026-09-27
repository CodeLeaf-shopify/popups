export type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlBody<T> = {
  data?: T;
  errors?: { message: string }[];
};

export async function adminGraphql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await response.json()) as GraphqlBody<T>;
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) throw new Error("Shopify returned an empty response.");
  return body.data;
}

export function formatUserErrors(
  errors: { message: string }[] | null | undefined,
): string | null {
  if (!errors?.length) return null;
  return errors.map((error) => error.message).join("; ");
}
