import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { getShopPlan } from "../popup/billing.server";
import { parseBehavior } from "../popup/parse";
import { FREE_PUBLISHED_LIMIT } from "../popup/plans";
import { createFromTemplate, isTemplateId, TEMPLATES, type TemplateId } from "../popup/presets";
import { setPopupStatus } from "../popup/publish.server";
import { EMBED_HANDLE, type PopupStatus } from "../popup/types";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const plan = await getShopPlan(admin, session.shop);
  const [popups, publication, runningTests] = await Promise.all([
    prisma.popup.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, status: true, draftBehavior: true, updatedAt: true },
    }),
    prisma.publication.findUnique({ where: { shop: session.shop } }),
    prisma.popupTest.findMany({
      where: { shop: session.shop, status: "running" },
      select: { variantAId: true, variantBId: true },
    }),
  ]);
  const testing = new Set(runningTests.flatMap((test) => [test.variantAId, test.variantBId]));

  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan: plan.plan,
    unpublished: plan.unpublished,
    popups: popups.map((popup) => ({
      id: popup.id,
      name: popup.name,
      status: popupStatus(popup.status),
      ...behaviorSummary(popup.draftBehavior),
      inTest: testing.has(popup.id),
      updatedAt: popup.updatedAt.toISOString(),
    })),
    publicationError: publication?.syncStatus === "failed" ? publication.error : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "archive" || intent === "restore") {
    const popupId = form.get("popupId");
    if (typeof popupId !== "string" || !popupId) return { error: "Choose a popup." };
    const status = intent === "archive" ? "archived" : "draft";
    const result = await setPopupStatus(admin, session.shop, popupId, status);
    if (!result.ok) return { error: result.error };
    return { ok: true, popupId, status };
  }

  const requested = form.get("template") ?? "blank";
  if (!isTemplateId(requested)) {
    return { error: "Choose a template." };
  }
  const draft = createFromTemplate(requested);
  const popup = await prisma.popup.create({
    data: {
      shop: session.shop,
      name: draft.name,
      template: draft.template,
      status: "draft",
      schemaVersion: draft.document.schemaVersion,
      draftDocument: JSON.stringify(draft.document),
      draftBehavior: JSON.stringify(draft.behavior),
    },
  });
  return redirect(`/app/popups/${popup.id}`);
};

export default function PopupsIndex() {
  const { shop, apiKey, popups, publicationError, plan, unpublished } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const embedUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${EMBED_HANDLE}`;
  const activePopups = popups.filter((popup) => popup.status !== "archived");
  const publishedCount = popups.filter((popup) => popup.status === "published").length;
  const archivedPopups = popups.filter((popup) => popup.status === "archived");
  const actionError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const busy = fetcher.state !== "idle";
  const create = (template: TemplateId = "blank") =>
    fetcher.submit({ intent: "create", template }, { method: "POST" });
  const popupTable = (rows: typeof popups) => (
    <s-table variant="auto">
      <s-table-header-row>
        <s-table-header listSlot="primary">Popup</s-table-header>
        <s-table-header listSlot="secondary">Status</s-table-header>
        <s-table-header listSlot="labeled">Format</s-table-header>
        <s-table-header listSlot="labeled">Trigger</s-table-header>
        <s-table-header listSlot="labeled">Updated</s-table-header>
        <s-table-header>Actions</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {rows.map((popup) => (
          <s-table-row key={popup.id}>
            <s-table-cell>
              <s-link href={`/app/popups/${popup.id}`}>{popup.name}</s-link>
            </s-table-cell>
            <s-table-cell>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={toneFor(popup.status)}>{labelFor(popup.status)}</s-badge>
                {popup.inTest ? <s-badge tone="info">In test</s-badge> : null}
              </s-stack>
            </s-table-cell>
            <s-table-cell>{popup.presentation}</s-table-cell>
            <s-table-cell>{popup.trigger}</s-table-cell>
            <s-table-cell>{formatDate(popup.updatedAt)}</s-table-cell>
            <s-table-cell>
              <s-button
                variant="tertiary"
                {...(busy ? { disabled: true } : {})}
                onClick={() =>
                  fetcher.submit(
                    {
                      intent: popup.status === "archived" ? "restore" : "archive",
                      popupId: popup.id,
                    },
                    { method: "POST" },
                  )
                }
              >
                {popup.status === "archived" ? "Restore" : "Archive"}
              </s-button>
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );

  return (
    <s-page heading="Popups" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        {...(busy ? { disabled: true } : {})}
        onClick={() => create()}
      >
        Create popup
      </s-button>
      <s-button slot="secondary-actions" commandFor="template-menu" {...(busy ? { disabled: true } : {})}>
        Use template
      </s-button>
      <s-menu id="template-menu" accessibilityLabel="Popup templates">
        {TEMPLATES.map((template) => (
          <s-button key={template.id} onClick={() => create(template.id)}>
            {template.label}
          </s-button>
        ))}
      </s-menu>
      <s-stack direction="block" gap="base">
        {actionError ? <s-banner tone="critical">{actionError}</s-banner> : null}
        {unpublished.length ? (
          <s-banner tone="warning" heading="Some popups were unpublished">
            The Free plan keeps {FREE_PUBLISHED_LIMIT} published popups and leaves out Pro features. Unpublished:{" "}
            {unpublished.join(", ")}. <s-link href="/app/plans">View plans</s-link>
          </s-banner>
        ) : null}
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
        <s-section heading="Active popups">
          {plan === "free" ? (
            <s-paragraph>
              Free plan: {publishedCount} of {FREE_PUBLISHED_LIMIT} popups published.{" "}
              <s-link href="/app/plans">Upgrade to Pro</s-link> for unlimited popups.
            </s-paragraph>
          ) : (
            <s-paragraph>Pro plan. Unlimited published popups.</s-paragraph>
          )}
          {activePopups.length === 0 ? (
            <s-paragraph>No active popups yet. Create one or start from a template to open the builder.</s-paragraph>
          ) : (
            popupTable(activePopups)
          )}
        </s-section>
        <s-section id="archived-popups" heading={`Archived popups (${archivedPopups.length})`}>
          {archivedPopups.length === 0 ? (
            <s-paragraph>Archived popups will appear here so they can be restored.</s-paragraph>
          ) : (
            popupTable(archivedPopups)
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

function popupStatus(value: string): PopupStatus {
  if (value === "published" || value === "archived") return value;
  return "draft";
}

function behaviorSummary(serialized: string): { presentation: string; trigger: string } {
  try {
    const behavior = parseBehavior(JSON.parse(serialized));
    return {
      presentation: behavior.presentation === "bar" ? "Announcement bar" : "Modal",
      trigger:
        behavior.trigger.type === "delay"
          ? `${behavior.trigger.seconds}s delay`
          : behavior.trigger.type === "scroll"
            ? `${behavior.trigger.percent}% scroll`
            : behavior.trigger.type === "exit"
              ? "Exit intent"
              : "Immediately",
    };
  } catch {
    return { presentation: "Unknown", trigger: "Unknown" };
  }
}

function toneFor(status: PopupStatus): "success" | "info" | "warning" {
  return status === "published" ? "success" : status === "archived" ? "warning" : "info";
}

function labelFor(status: PopupStatus): string {
  return status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
