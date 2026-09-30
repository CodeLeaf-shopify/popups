import prisma from "../db.server";
import { parseShopSettings } from "./parse";
import type { ManifestSettings, ShopSettings } from "./types";

export async function getShopSettings(shop: string): Promise<ShopSettings> {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return parseShopSettings(row);
}

export async function saveShopSettings(shop: string, settings: ShopSettings): Promise<ShopSettings> {
  const data = {
    conflictMode: settings.conflictMode,
    paused: settings.paused,
    tokens: JSON.stringify(settings.tokens),
    excludePaths: JSON.stringify(settings.exclude),
    hideForSubscribed: settings.hideForSubscribed,
    hideForLoggedIn: settings.hideForLoggedIn,
  };
  const row = await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
  return parseShopSettings(row);
}

export function manifestSettings(settings: ShopSettings): ManifestSettings {
  return {
    conflictMode: settings.conflictMode,
    paused: settings.paused,
    exclude: settings.exclude,
    hideForSubscribed: settings.hideForSubscribed,
    hideForLoggedIn: settings.hideForLoggedIn,
  };
}
