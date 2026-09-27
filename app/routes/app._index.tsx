import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { EMBED_HANDLE, type PopupKind } from "../popup/types";
import { createPreset, isPopupKind } from "../popup/presets";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [popups, publication] = await Promise.all([
    prisma.popup.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, kind: true, status: true, updatedAt: true },
    }),
    prisma.publication.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    popups: popups.map((popup) => ({
      ...popup,
      updatedAt: popup.updatedAt.toISOString(),
    })),
    publicationError: publication?.syncStatus === "failed" ? publication.error : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const kind = form.get("kind");
  if (!isPopupKind(kind)) {
    return { error: "Choose a popup type." };
  }
  const preset = createPreset(kind);
  const popup = await prisma.popup.create({
    data: {
      shop: session.shop,
      name: preset.name,
      kind: preset.kind,
      status: "draft",
      schemaVersion: preset.document.schemaVersion,
      draftDocument: JSON.stringify(preset.document),
      draftBehavior: JSON.stringify(preset.behavior),
    },
  });
  return redirect(`/app/popups/${popup.id}`);
};

const PRESETS: { kind: PopupKind; label: string; detail: string }[] = [
  { kind: "email", label: "Email capture", detail: "Modal with a form" },
  { kind: "discount", label: "Discount reveal", detail: "Modal with a code" },
  { kind: "exit", label: "Exit intent", detail: "Modal that waits for exit" },
  { kind: "announcement", label: "Announcement bar", detail: "Bar across the top of the page" },
];

export default function PopupsIndex() {
  const { shop, apiKey, popups, publicationError } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const embedUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${EMBED_HANDLE}`;

  return (
    <s-page heading="Popups">
      <s-stack direction="block" gap="base">
        {publicationError ? (
          <s-banner tone="warning" heading="Storefront sync needs attention">
            {publicationError}
          </s-banner>
        ) : null}
        <s-section heading="Theme embed">
          <s-paragraph>
            Popups render through one theme app embed. Turn it on once, then every published popup uses it.
          </s-paragraph>
          <s-link href={embedUrl} target="_blank">
            Enable Leaf Popups in the theme editor
          </s-link>
        </s-section>
        <s-section heading="Create">
          <s-stack direction="inline" gap="base">
            {PRESETS.map((preset) => (
              <s-button
                key={preset.kind}
                onClick={() => fetcher.submit({ kind: preset.kind }, { method: "POST" })}
              >
                {preset.label}
              </s-button>
            ))}
          </s-stack>
        </s-section>
        <s-section heading="Your popups">
          {popups.length === 0 ? (
            <s-paragraph>No popups yet. Create one to open the builder.</s-paragraph>
          ) : (
            <s-stack direction="block" gap="base">
              {popups.map((popup) => (
                <s-stack key={popup.id} direction="inline" gap="base">
                  <s-link href={`/app/popups/${popup.id}`}>{popup.name}</s-link>
                  <s-badge tone={toneFor(popup.status)}>{labelFor(popup.status)}</s-badge>
                  <s-text>{popup.kind}</s-text>
                </s-stack>
              ))}
            </s-stack>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

function toneFor(status: string): "success" | "warning" | "info" {
  if (status === "published") return "success";
  if (status === "paused") return "warning";
  return "info";
}

function labelFor(status: string): string {
  if (status === "published" || status === "paused" || status === "draft") {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  return status;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
