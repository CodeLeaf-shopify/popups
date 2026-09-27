import { adminGraphql, formatUserErrors, type AdminClient } from "./admin-graphql.server";

const STAGED_UPLOAD = `#graphql
  mutation LeafPopupsStagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation LeafPopupsFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        ... on GenericFile { url }
      }
      userErrors { field message }
    }
  }
`;

const FILE_NODE = `#graphql
  query LeafPopupsFile($id: ID!) {
    node(id: $id) {
      ... on GenericFile {
        url
        fileStatus
      }
    }
  }
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadPopupPayload(
  admin: AdminClient,
  filename: string,
  contents: string,
): Promise<string> {
  const staged = await adminGraphql<{
    stagedUploadsCreate: {
      stagedTargets: {
        url: string;
        resourceUrl: string;
        parameters: { name: string; value: string }[];
      }[];
      userErrors: { message: string }[];
    };
  }>(admin, STAGED_UPLOAD, {
    input: [
      {
        filename,
        mimeType: "application/json",
        resource: "FILE",
        httpMethod: "POST",
      },
    ],
  });
  const stagedError = formatUserErrors(staged.stagedUploadsCreate.userErrors);
  if (stagedError) throw new Error(stagedError);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("Shopify did not return an upload target.");

  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([contents], { type: "application/json" }), filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error("Shopify rejected the popup file upload.");

  const created = await adminGraphql<{
    fileCreate: {
      files: { id: string; url?: string | null; fileStatus: string }[];
      userErrors: { message: string }[];
    };
  }>(admin, FILE_CREATE, {
    files: [
      {
        originalSource: target.resourceUrl,
        contentType: "FILE",
        filename,
      },
    ],
  });
  const createError = formatUserErrors(created.fileCreate.userErrors);
  if (createError) throw new Error(createError);
  const file = created.fileCreate.files[0];
  if (!file) throw new Error("Shopify did not create the popup file.");
  if (file.url) return file.url;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(400);
    const node = await adminGraphql<{
      node: { url?: string | null; fileStatus?: string } | null;
    }>(admin, FILE_NODE, { id: file.id });
    if (node.node?.url) return node.node.url;
    if (node.node?.fileStatus === "FAILED") {
      throw new Error("Shopify could not store the popup file.");
    }
  }
  throw new Error("The popup file was not ready in time.");
}
