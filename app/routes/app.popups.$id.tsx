import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { PopupEditor } from "../components/PopupEditor";
import prisma from "../db.server";
import { parseBehavior, parseEditorDocument, parsePayload } from "../popup/parse";
import { previewLink } from "../popup/preview-token.server";
import { publishPopup, setPopupStatus } from "../popup/publish.server";
import { readRendererSource } from "../popup/renderer-source.server";
import type { Behavior, EditorDocument, PopupStatus, StorefrontPayload } from "../popup/types";
import { authenticate } from "../shopify.server";

type EditorRequest = {
  intent?: string;
  name?: string;
  document?: unknown;
  behavior?: unknown;
  updatedAt?: string;
  clientKey?: string;
};

function popupStatus(value: string): PopupStatus {
  if (value === "published" || value === "archived") return value;
  return "draft";
}

function readPublishedPayload(status: PopupStatus, compiledPayload: string | null): StorefrontPayload | null {
  if (status !== "published" || !compiledPayload) return null;
  try {
    return parsePayload(JSON.parse(compiledPayload));
  } catch {
    return null;
  }
}

function keepDiscountId(incoming: Behavior, stored: string): Behavior {
  if (!incoming.discount || incoming.discount.shopifyDiscountId) return incoming;
  try {
    const previous = parseBehavior(JSON.parse(stored)).discount;
    if (!previous?.shopifyDiscountId || !previous.code) return incoming;
    if (previous.mode !== incoming.discount.mode || previous.code !== incoming.discount.code) return incoming;
    return { ...incoming, discount: { ...incoming.discount, shopifyDiscountId: previous.shopifyDiscountId } };
  } catch {
    return incoming;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const popup = await prisma.popup.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!popup) throw new Response("Popup not found", { status: 404 });
  const document = parseEditorDocument(JSON.parse(popup.draftDocument));
  const behavior = parseBehavior(JSON.parse(popup.draftBehavior));
  const status = popupStatus(popup.status);
  return {
    rendererSource: readRendererSource(),
    document,
    behavior,
    updatedAt: popup.updatedAt.toISOString(),
    publishedPayload: readPublishedPayload(status, popup.compiledPayload),
    preview: previewLink(session.shop, popup.id),
    meta: {
      id: popup.id,
      name: popup.name,
      kind: popup.kind,
      status,
      shop: popup.shop,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const popup = await prisma.popup.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!popup) throw new Response("Popup not found", { status: 404 });
  const body = (await request.json()) as EditorRequest;
  const intent = body.intent;

  if (intent === "preview-link") {
    return { ok: true, intent, preview: previewLink(session.shop, popup.id) };
  }

  if (body.updatedAt && Math.abs(popup.updatedAt.getTime() - Date.parse(body.updatedAt)) > 1500) {
    return data(
      { ok: false, intent, error: "This popup was saved somewhere else. Reload the page before editing again." },
      { status: 409 },
    );
  }

  if (intent === "unpublish") {
    const result = await setPopupStatus(admin, session.shop, popup.id, "draft");
    if (!result.ok) return { ok: false, intent, error: result.error };
    return { ok: true, intent, updatedAt: result.updatedAt, status: "draft" as const };
  }

  let document: EditorDocument;
  let behavior: Behavior;
  try {
    document = parseEditorDocument(body.document);
    behavior = parseBehavior(body.behavior);
  } catch (error) {
    return {
      ok: false,
      intent,
      error: error instanceof Error ? error.message : "The popup design could not be read.",
    };
  }
  const name = body.name?.trim() || popup.name;
  behavior = keepDiscountId(behavior, popup.draftBehavior);

  if (intent === "publish") {
    try {
      const result = await publishPopup(admin, session.shop, popup.id, name, document, behavior);
      if (!result.ok) return { ok: false, intent, error: result.error };
      return {
        ok: true,
        intent,
        updatedAt: result.updatedAt,
        status: "published" as const,
        clientKey: body.clientKey,
        payload: result.payload,
        behavior: result.behavior,
      };
    } catch (error) {
      return {
        ok: false,
        intent,
        error: error instanceof Error ? error.message : "Publish failed.",
      };
    }
  }

  const updated = await prisma.popup.update({
    where: { id: popup.id },
    data: {
      name,
      schemaVersion: document.schemaVersion,
      draftDocument: JSON.stringify(document),
      draftBehavior: JSON.stringify(behavior),
    },
  });
  return {
    ok: true,
    intent: "save",
    updatedAt: updated.updatedAt.toISOString(),
    clientKey: body.clientKey,
    status: popupStatus(updated.status),
  };
};

export default function PopupRoute() {
  const { rendererSource, document, behavior, updatedAt, meta, publishedPayload, preview } =
    useLoaderData<typeof loader>();
  return (
    <PopupEditor
      key={meta.id}
      rendererSource={rendererSource}
      initialDocument={document}
      initialBehavior={behavior}
      updatedAt={updatedAt}
      meta={meta}
      publishedPayload={publishedPayload}
      preview={preview}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
