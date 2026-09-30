import { createHash } from "node:crypto";

import type { Popup } from "@prisma/client";

import prisma from "../db.server";
import { compile } from "./compile";
import { createSharedDiscount, discountCode } from "./discounts.server";
import { uploadPopupPayload } from "./files.server";
import { ensureMetafieldDefinitions, writeShopManifest } from "./metafields.server";
import { parseBehavior, parseEditorDocument, parsePayload } from "./parse";
import { getShopSettings, manifestSettings } from "./settings.server";
import type { AdminClient } from "./admin-graphql.server";
import {
  resolveTokens,
  type Behavior,
  type EditorDocument,
  type Manifest,
  type ManifestCampaign,
  type StorefrontPayload,
  type Tokens,
} from "./types";

export function contentRevision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

async function campaignFromPopup(popup: Popup): Promise<ManifestCampaign | null> {
  if (popup.status !== "published" || !popup.compiledPayload || !popup.assetUrl || !popup.contentRevision) {
    return null;
  }
  const payload = parsePayload(JSON.parse(popup.compiledPayload));
  return {
    id: popup.id,
    revision: popup.contentRevision,
    kind: payload.document.kind,
    position: payload.document.position === "bottom" ? "bottom" : "top",
    priority: payload.behavior.priority,
    trigger: payload.behavior.trigger,
    frequency: payload.behavior.frequency,
    schedule: payload.behavior.schedule,
    targeting: payload.behavior.targeting,
    url: popup.assetUrl,
  };
}

export async function syncManifest(
  admin: AdminClient,
  shop: string,
): Promise<{ ok: true; manifest: Manifest } | { ok: false; error: string }> {
  const popups = await prisma.popup.findMany({ where: { shop, status: "published" } });
  const campaigns: ManifestCampaign[] = [];
  for (const popup of popups) {
    const campaign = await campaignFromPopup(popup);
    if (campaign) campaigns.push(campaign);
  }
  campaigns.sort((left, right) => right.priority - left.priority);
  const settings = manifestSettings(await getShopSettings(shop));
  const manifest: Manifest = {
    revision: contentRevision({ settings, campaigns }),
    settings,
    campaigns,
  };
  try {
    await ensureMetafieldDefinitions(admin);
    await writeShopManifest(admin, manifest);
    await prisma.publication.upsert({
      where: { shop },
      create: { shop, manifest: JSON.stringify(manifest), syncStatus: "synced", error: null, syncedAt: new Date() },
      update: { manifest: JSON.stringify(manifest), syncStatus: "synced", error: null, syncedAt: new Date() },
    });
    return { ok: true, manifest };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The storefront manifest could not be saved.";
    await prisma.publication.upsert({
      where: { shop },
      create: { shop, manifest: JSON.stringify(manifest), syncStatus: "failed", error: message, syncedAt: new Date() },
      update: { manifest: JSON.stringify(manifest), syncStatus: "failed", error: message, syncedAt: new Date() },
    });
    return { ok: false, error: message };
  }
}

async function ensureSharedCode(
  admin: AdminClient,
  name: string,
  behavior: Behavior,
): Promise<Behavior> {
  if (behavior.goal !== "discount" || !behavior.discount) return behavior;
  if (behavior.discount.mode !== "shared") return behavior;
  if (behavior.discount.shopifyDiscountId && behavior.discount.code) return behavior;
  const code = behavior.discount.code || discountCode();
  const shopifyDiscountId = await createSharedDiscount(
    admin,
    `Leaf Popups — ${name}`,
    code,
    behavior.discount.percentage,
  );
  return {
    ...behavior,
    discount: { ...behavior.discount, code, shopifyDiscountId },
  };
}

export async function publishPopup(
  admin: AdminClient,
  shop: string,
  popupId: string,
  name: string,
  document: EditorDocument,
  behavior: Behavior,
): Promise<
  | { ok: true; updatedAt: string; revision: string; payload: StorefrontPayload; behavior: Behavior }
  | { ok: false; error: string }
> {
  const existing = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!existing) return { ok: false, error: "Popup not found." };
  const { tokens: globalTokens } = await getShopSettings(shop);
  const preview = compile(document, behavior, globalTokens);
  if (!preview.ok) return preview;
  const withCode = await ensureSharedCode(admin, name, behavior);
  const compiled = compile(document, withCode, globalTokens);
  if (!compiled.ok) return compiled;
  const revision = contentRevision(compiled.payload);
  const assetUrl = await uploadPopupPayload(
    admin,
    `leaf-popup-${popupId}-${revision}.json`,
    JSON.stringify(compiled.payload),
  );
  const updated = await prisma.popup.update({
    where: { id: popupId },
    data: {
      shop,
      name,
      status: "published",
      schemaVersion: document.schemaVersion,
      draftDocument: JSON.stringify(document),
      draftBehavior: JSON.stringify(withCode),
      compiledPayload: JSON.stringify(compiled.payload),
      contentRevision: revision,
      assetUrl,
      publishedTokens: JSON.stringify(document.tokens),
    },
  });
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) return { ok: false, error: synced.error };
  return {
    ok: true,
    updatedAt: updated.updatedAt.toISOString(),
    revision,
    payload: compiled.payload,
    behavior: withCode,
  };
}

export async function republishAll(
  admin: AdminClient,
  shop: string,
): Promise<{ ok: true; republished: number } | { ok: false; error: string }> {
  const { tokens: globalTokens } = await getShopSettings(shop);
  const popups = await prisma.popup.findMany({ where: { shop, status: "published" } });
  const failures: string[] = [];
  let republished = 0;
  for (const popup of popups) {
    if (!popup.compiledPayload) continue;
    try {
      // Only tokens are re-resolved: the draft may hold edits that were never published.
      const live = parsePayload(JSON.parse(popup.compiledPayload));
      const overrides = popup.publishedTokens
        ? (JSON.parse(popup.publishedTokens) as Partial<Tokens>)
        : live.document.tokens;
      const payload: StorefrontPayload = {
        ...live,
        document: { ...live.document, tokens: resolveTokens(globalTokens, overrides) },
      };
      const revision = contentRevision(payload);
      if (revision === popup.contentRevision) continue;
      const assetUrl = await uploadPopupPayload(
        admin,
        `leaf-popup-${popup.id}-${revision}.json`,
        JSON.stringify(payload),
      );
      await prisma.popup.update({
        where: { id: popup.id },
        data: {
          compiledPayload: JSON.stringify(payload),
          contentRevision: revision,
          assetUrl,
          updatedAt: popup.updatedAt,
        },
      });
      republished += 1;
    } catch (error) {
      failures.push(`${popup.name}: ${error instanceof Error ? error.message : "could not be republished"}`);
    }
  }
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) return synced;
  if (failures.length) return { ok: false, error: `Some popups kept their previous styles. ${failures.join(" ")}` };
  return { ok: true, republished };
}

export async function setPopupStatus(
  admin: AdminClient,
  shop: string,
  popupId: string,
  status: "draft" | "archived",
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const existing = await prisma.popup.findFirst({ where: { id: popupId, shop } });
  if (!existing) return { ok: false, error: "Popup not found." };
  const updated = await prisma.popup.update({
    where: { id: popupId },
    data: { status },
  });
  const synced = await syncManifest(admin, shop);
  if (!synced.ok) return synced;
  return { ok: true, updatedAt: updated.updatedAt.toISOString() };
}

export function draftsFromRow(row: { draftDocument: string; draftBehavior: string }): {
  document: EditorDocument;
  behavior: Behavior;
} {
  return {
    document: parseEditorDocument(JSON.parse(row.draftDocument)),
    behavior: parseBehavior(JSON.parse(row.draftBehavior)),
  };
}
