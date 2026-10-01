import type { Behavior, Device, Schedule } from "./types";

export const FREE_PUBLISHED_LIMIT = 3;
export const PLAN_STALE_MS = 5 * 60 * 1000;
export const PRO_PLAN_HANDLE = "pro";
export const PRO_PRICE_LABEL = "$9 USD every 30 days";

export type ShopPlan = "free" | "pro";

export function proUnlocked(): boolean {
  return process.env.PRO_UNLOCKED === "true";
}

const DEVICES: Device[] = ["desktop", "mobile"];

export function targetsAllDevices(devices: Device[] | undefined): boolean {
  if (!devices) return true;
  return devices.includes("desktop") && devices.includes("mobile");
}

export function usesProFeatures(behavior: Behavior): boolean {
  if (behavior.trigger.type === "exit") return true;
  if (behavior.schedule?.start || behavior.schedule?.end) return true;
  if (!targetsAllDevices(behavior.targeting?.devices)) return true;
  if (behavior.discount?.mode === "unique") return true;
  return false;
}

export function publishedLimitMessage(): string {
  return `The Free plan publishes up to ${FREE_PUBLISHED_LIMIT} popups. Upgrade on the Plans page to publish more.`;
}

export function proFeatureMessage(): string {
  return "Exit intent, scheduling, device targeting, and unique discount codes are on the Pro plan. Upgrade on the Plans page.";
}

export function scheduleDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

export function scheduleInstant(date: string, bound: "start" | "end"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const iso = `${date}${bound === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"}`;
  if (Number.isNaN(Date.parse(iso))) return null;
  return iso;
}

export function scheduleOrderError(schedule: Schedule | undefined): string | null {
  if (!schedule?.start || !schedule.end) return null;
  if (Date.parse(schedule.end) < Date.parse(schedule.start)) {
    return "The schedule end is before the start.";
  }
  return null;
}

export function orderedDevices(devices: Iterable<Device>): Device[] {
  const selected = new Set(devices);
  return DEVICES.filter((device) => selected.has(device));
}
