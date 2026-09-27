import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { PopupEditor } from "../components/PopupEditor";
import prisma from "../db.server";
import { parseBehavior, parseEditorDocument } from "../popup/parse";
import { signPreviewToken } from "../popup/preview-token.server";
import { publishPopup, setPopupStatus } from "../popup/publish.server";
import { readRendererSource } from "../popup/renderer-source.server";
import type { Behavior, EditorDocument, PopupStatus } from "../popup/types";
import { authenticate } from "../shopify.server";

type EditorRequest = {
  intent?: string;
  name?: string;
  document?: unknown;
  behavior?: unknown;
  updatedAt?: string;
  clientKey?: string;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const popup = await prisma.popup.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!popup) throw new Response("Popup not found", { status: 404 });
  const document = parseEditorDocument(JSON.parse(popup.draftDocument));
  const behavior = parseBehavior(JSON.parse(popup.draftBehavior));
  return {
    rendererSource: readRendererSource(),
    document,
    behavior,
    updatedAt: popup.updatedAt.toISOString(),
    meta: {
      id: popup.id,
      name: popup.name,
      kind: popup.kind,
      status: popup.status as PopupStatus,
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
    return { ok: true, intent, token: signPreviewToken(session.shop, popup.id), shop: session.shop };
  }

  if (body.updatedAt && Math.abs(popup.updatedAt.getTime() - Date.parse(body.updatedAt)) > 1500) {
    return data(
      { ok: false, intent, error: "This popup was saved somewhere else. Reload the page before editing again." },
      { status: 409 },
    );
  }

  if (intent === "pause" || intent === "unpublish") {
    const result = await setPopupStatus(admin, session.shop, popup.id, intent === "pause" ? "paused" : "draft");
    if (!result.ok) return { ok: false, intent, error: result.error };
    return { ok: true, intent, updatedAt: result.updatedAt, status: intent === "pause" ? "paused" : "draft" };
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
    status: updated.status as PopupStatus,
  };
};

export default function PopupRoute() {
  const { rendererSource, document, behavior, updatedAt, meta } = useLoaderData<typeof loader>();
  return (
    <PopupEditor
      rendererSource={rendererSource}
      initialDocument={document}
      initialBehavior={behavior}
      updatedAt={updatedAt}
      meta={meta}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
