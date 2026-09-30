import {
  DEFAULT_MANIFEST_SETTINGS,
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_TOKENS,
  SCHEMA_VERSION,
  TOKEN_KEYS,
  emptyCustomerState,
  type Behavior,
  type ConflictMode,
  type CustomerState,
  type EditorDocument,
  type EditorNode,
  type Manifest,
  type ShopSettings,
  type StorefrontPayload,
  type Tokens,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateDocument(document: EditorDocument): EditorDocument {
  if (document.schemaVersion === SCHEMA_VERSION) return document;
  throw new Error(`Unsupported popup schema version ${document.schemaVersion}.`);
}

export function parseEditorDocument(raw: unknown): EditorDocument {
  if (!isRecord(raw) || typeof raw.rootId !== "string" || !isRecord(raw.nodes) || !isRecord(raw.tokens)) {
    throw new Error("The saved popup design is invalid.");
  }
  const document = raw as unknown as EditorDocument;
  if (!document.nodes[document.rootId]) {
    throw new Error("The saved popup design is missing its root.");
  }
  return migrateDocument(document);
}

export function parseBehavior(raw: unknown): Behavior {
  if (!isRecord(raw) || !isRecord(raw.trigger) || !isRecord(raw.frequency) || !isRecord(raw.targeting)) {
    throw new Error("The saved popup behavior is invalid.");
  }
  const behavior = { ...raw } as unknown as Behavior & { goal?: unknown };
  delete behavior.goal;
  return {
    ...behavior,
    barPosition: behavior.barPosition === "bottom" ? "bottom" : "top",
    targeting: { ...behavior.targeting, hideForLoggedIn: behavior.targeting.hideForLoggedIn === true },
  };
}

export function parsePayload(raw: unknown): StorefrontPayload {
  if (!isRecord(raw) || !isRecord(raw.document) || !isRecord(raw.behavior)) {
    throw new Error("The published popup payload is invalid.");
  }
  return raw as unknown as StorefrontPayload;
}

export function parseManifest(raw: string | null | undefined): Manifest {
  const empty: Manifest = { revision: "", settings: { ...DEFAULT_MANIFEST_SETTINGS }, campaigns: [] };
  if (!raw) return empty;
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed || !Array.isArray(parsed.campaigns)) return empty;
  return { ...parsed, settings: { ...DEFAULT_MANIFEST_SETTINGS, ...(isRecord(parsed.settings) ? parsed.settings : {}) } };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isConflictMode(value: unknown): value is ConflictMode {
  return value === "all" || value === "queue" || value === "single";
}

export function parseTokens(raw: unknown): Tokens {
  const tokens: Tokens = { ...DEFAULT_TOKENS };
  if (!isRecord(raw)) return tokens;
  for (const key of TOKEN_KEYS) {
    const value = raw[key];
    if (typeof DEFAULT_TOKENS[key] === "number") {
      if (typeof value === "number" && Number.isFinite(value)) (tokens[key] as number) = value;
    } else if (typeof value === "string" && value.trim()) {
      (tokens[key] as string) = value.trim();
    }
  }
  return tokens;
}

export function parsePathList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
}

export function parseShopSettings(
  row: {
    conflictMode: string;
    paused: boolean;
    tokens: string;
    excludePaths: string;
    hideForSubscribed: boolean;
    hideForLoggedIn: boolean;
  } | null,
): ShopSettings {
  if (!row) return { ...DEFAULT_SHOP_SETTINGS, tokens: { ...DEFAULT_TOKENS }, exclude: [] };
  return {
    conflictMode: isConflictMode(row.conflictMode) ? row.conflictMode : "queue",
    paused: row.paused,
    tokens: parseTokens(parseJson(row.tokens)),
    exclude: parsePathList(parseJson(row.excludePaths)),
    hideForSubscribed: row.hideForSubscribed,
    hideForLoggedIn: row.hideForLoggedIn,
  };
}

export function parseCustomerState(raw: string | null | undefined): CustomerState {
  if (!raw) return emptyCustomerState();
  try {
    const parsed = JSON.parse(raw) as CustomerState;
    return {
      popups: parsed.popups ?? {},
      codes: parsed.codes ?? {},
      consent: parsed.consent,
    };
  } catch {
    return emptyCustomerState();
  }
}

export function readNode(document: EditorDocument, id: string): EditorNode | null {
  return document.nodes[id] ?? null;
}
