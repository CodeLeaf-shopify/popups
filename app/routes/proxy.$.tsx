import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { compile } from "../popup/compile";
import { recordPopupEvent, submitPopup } from "../popup/customers.server";
import { draftsFromRow } from "../popup/publish.server";
import { verifyPreviewToken } from "../popup/preview-token.server";
import { authenticate } from "../shopify.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function proxyContext(request: Request) {
  const context = await authenticate.public.appProxy(request);
  if (!context.session || !context.admin) return null;
  return context;
}

function loggedInCustomer(request: Request): string | null {
  return new URL(request.url).searchParams.get("logged_in_customer_id");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = await proxyContext(request);
  if (!context) return json({ ok: false, error: "App proxy is not authenticated." }, 401);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/draft")) return json({ ok: false, error: "Not found." }, 404);
  const token = url.searchParams.get("token") ?? "";
  const claims = verifyPreviewToken(token, context.session.shop);
  if (!claims) return json({ ok: false, error: "Preview link expired." }, 401);
  const popup = await prisma.popup.findFirst({ where: { id: claims.popupId, shop: context.session.shop } });
  if (!popup) return json({ ok: false, error: "Popup not found." }, 404);
  const { document, behavior } = draftsFromRow(popup);
  const compiled = compile(document, behavior);
  if (!compiled.ok) return json({ ok: false, error: compiled.error }, 422);
  return json({ ...compiled.payload, popupId: popup.id });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const context = await proxyContext(request);
  if (!context) return json({ ok: false, error: "App proxy is not authenticated." }, 401);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const body = (await request.json().catch(() => null)) as {
    popupId?: string;
    email?: string;
    consent?: boolean;
    claim?: boolean;
    event?: string;
  } | null;
  if (!body?.popupId) return json({ ok: false, error: "Missing popup." }, 400);

  try {
    if (path.endsWith("/event")) {
      const event = body.event === "dismissed" ? "dismissed" : "shown";
      const result = await recordPopupEvent(
        context.admin,
        context.session.shop,
        body.popupId,
        loggedInCustomer(request),
        event,
      );
      return json(result, result.ok ? 200 : 400);
    }
    const result = await submitPopup(context.admin, context.session.shop, {
      popupId: body.popupId,
      email: body.email,
      consent: body.consent,
      claim: body.claim,
      loggedInCustomerId: loggedInCustomer(request),
    });
    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "The popup could not be saved." },
      500,
    );
  }
};
