import {
  SCHEMA_VERSION,
  emptyCustomerState,
  type Behavior,
  type CustomerState,
  type EditorDocument,
  type EditorNode,
  type Manifest,
  type StorefrontPayload,
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
  const behavior = raw as unknown as Behavior;
  return { ...behavior, barPosition: behavior.barPosition === "bottom" ? "bottom" : "top" };
}

export function parsePayload(raw: unknown): StorefrontPayload {
  if (!isRecord(raw) || !isRecord(raw.document) || !isRecord(raw.behavior)) {
    throw new Error("The published popup payload is invalid.");
  }
  return raw as unknown as StorefrontPayload;
}

export function parseManifest(raw: string | null | undefined): Manifest {
  if (!raw) return { revision: "", campaigns: [] };
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed || !Array.isArray(parsed.campaigns)) return { revision: "", campaigns: [] };
  return parsed;
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
