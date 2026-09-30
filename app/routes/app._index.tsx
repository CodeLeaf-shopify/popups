import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { parseBehavior } from "../popup/parse";
import { createPreset, isPopupKind } from "../popup/presets";
import { setPopupStatus } from "../popup/publish.server";
import { EMBED_HANDLE, type PopupKind, type PopupStatus } from "../popup/types";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [popups, publication] = await Promise.all([
    prisma.popup.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, kind: true, status: true, draftBehavior: true, updatedAt: true },
    }),
    prisma.publication.findUnique({ where: { shop: session.shop } }),
  ]);

  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    popups: popups.map((popup) => ({
      id: popup.id,
      name: popup.name,
      kind: popup.kind,
      status: popupStatus(popup.status),
      ...behaviorSummary(popup.draftBehavior),
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
  const activePopups = popups.filter((popup) => popup.status !== "archived");
  const archivedPopups = popups.filter((popup) => popup.status === "archived");
  const actionError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const changingStatus = fetcher.state !== "idle";
  const popupTable = (rows: typeof popups) => (
    <s-table variant="auto">
      <s-table-header-row>
        <s-table-header listSlot="primary">Popup</s-table-header>
        <s-table-header listSlot="secondary">Status</s-table-header>
        <s-table-header listSlot="labeled">Type</s-table-header>
        <s-table-header listSlot="labeled">Goal and format</s-table-header>
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
              <s-badge tone={toneFor(popup.status)}>{labelFor(popup.status)}</s-badge>
            </s-table-cell>
            <s-table-cell>{kindLabel(popup.kind)}</s-table-cell>
            <s-table-cell>{`${popup.goal} · ${popup.presentation}`}</s-table-cell>
            <s-table-cell>{popup.trigger}</s-table-cell>
            <s-table-cell>{formatDate(popup.updatedAt)}</s-table-cell>
            <s-table-cell>
              <s-button
                variant="tertiary"
                {...(changingStatus ? { disabled: true } : {})}
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
      <s-button slot="secondary-actions" href="#archived-popups">
        Archived popups ({archivedPopups.length})
      </s-button>
      <s-stack direction="block" gap="base">
        {actionError ? <s-banner tone="critical">{actionError}</s-banner> : null}
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
                onClick={() => fetcher.submit({ intent: "create", kind: preset.kind }, { method: "POST" })}
              >
                {preset.label}
              </s-button>
            ))}
          </s-stack>
        </s-section>
        <s-section heading="Active popups">
          {activePopups.length === 0 ? (
            <s-paragraph>No active popups yet. Create one to open the builder.</s-paragraph>
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

function behaviorSummary(serialized: string): { presentation: string; goal: string; trigger: string } {
  try {
    const behavior = parseBehavior(JSON.parse(serialized));
    return {
      presentation: behavior.presentation === "bar" ? "Announcement bar" : "Modal",
      goal:
        behavior.goal === "email"
          ? "Email capture"
          : behavior.goal === "discount"
            ? "Discount"
            : "Announcement",
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
    return { presentation: "Unknown", goal: "Unknown", trigger: "Unknown" };
  }
}

function toneFor(status: PopupStatus): "success" | "info" | "warning" {
  return status === "published" ? "success" : status === "archived" ? "warning" : "info";
}

function labelFor(status: PopupStatus): string {
  return status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft";
}

function kindLabel(kind: string): string {
  return PRESETS.find((preset) => preset.kind === kind)?.label ?? kind;
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
