export const SCHEMA_VERSION = 1;

export const NAMESPACE = "leaf_popups";
export const CUSTOMER_STATE_KEY = "state";
export const SHOP_MANIFEST_KEY = "manifest";
export const EMBED_HANDLE = "leaf-popups";
export const PROXY_SUBPATH = "/apps/leaf-popups";

export const NODE_TYPES = [
  "stack",
  "columns",
  "text",
  "image",
  "button",
  "spacer",
  "divider",
  "form",
  "field",
  "coupon",
  "countdown",
  "close",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type PopupKind = "email" | "discount" | "exit" | "announcement";
export type PopupStatus = "draft" | "published" | "paused";
export type Presentation = "modal" | "bar";
export type Goal = "none" | "email" | "discount";
export type Device = "desktop" | "mobile";

export type Tokens = {
  background: string;
  text: string;
  accent: string;
  radius: number;
  overlay: string;
  width: number;
  font: string;
};

export type NodeProps = Record<string, string | number | boolean>;
export type NodeStyle = Record<string, string | number>;

export type EditorNode = {
  id: string;
  type: NodeType;
  parentId: string | null;
  childIds: string[];
  props: NodeProps;
  style: NodeStyle;
  locked: boolean;
  name: string;
};

export type EditorDocument = {
  schemaVersion: number;
  rootId: string;
  tokens: Tokens;
  nodes: Record<string, EditorNode>;
};

export type CompiledNode = {
  id: string;
  type: NodeType;
  props: NodeProps;
  style: NodeStyle;
  children?: CompiledNode[];
};

export type CompiledDocument = {
  schemaVersion: number;
  kind: Presentation;
  tokens: Tokens;
  root: CompiledNode;
};

export type Trigger =
  | { type: "immediate" }
  | { type: "delay"; seconds: number }
  | { type: "scroll"; percent: number }
  | { type: "exit" };

export type Frequency =
  | { type: "always" }
  | { type: "once" }
  | { type: "days"; days: number };

export type Schedule = { start: string | null; end: string | null };

export type Targeting = {
  devices: Device[];
  include: string[];
  exclude: string[];
  templates: string[];
};

export type DiscountConfig = {
  mode: "shared" | "unique";
  percentage: number;
  code: string | null;
  shopifyDiscountId: string | null;
};

export type Behavior = {
  presentation: Presentation;
  trigger: Trigger;
  frequency: Frequency;
  schedule: Schedule;
  targeting: Targeting;
  goal: Goal;
  priority: number;
  discount: DiscountConfig | null;
};

export type StorefrontPayload = {
  schemaVersion: number;
  document: CompiledDocument;
  behavior: Behavior;
};

export type CustomerPopupRecord = {
  lastShown?: string;
  dismissedAt?: string;
  submittedAt?: string;
};

export type CustomerState = {
  popups: Record<string, CustomerPopupRecord>;
  consent?: { at: string; popupId: string };
  codes: Record<string, string>;
};

export type ManifestCampaign = {
  id: string;
  revision: string;
  kind: Presentation;
  priority: number;
  trigger: Trigger;
  frequency: Frequency;
  schedule: Schedule;
  targeting: Targeting;
  url: string;
};

export type Manifest = {
  revision: string;
  campaigns: ManifestCampaign[];
};

export type Command =
  | { type: "insert"; parentId: string; index: number; nodeType: NodeType }
  | { type: "move"; nodeId: string; parentId: string; index: number }
  | { type: "updateProps"; nodeId: string; props: Partial<NodeProps> }
  | { type: "updateStyle"; nodeId: string; style: Partial<NodeStyle> }
  | { type: "updateTokens"; tokens: Partial<Tokens> }
  | { type: "delete"; nodeId: string }
  | { type: "duplicate"; nodeId: string };

export const DEFAULT_TOKENS: Tokens = {
  background: "#ffffff",
  text: "#1a1a1a",
  accent: "#111111",
  radius: 16,
  overlay: "rgba(17, 17, 17, 0.55)",
  width: 440,
  font: "system-ui, sans-serif",
};

export const CONTAINMENT: Record<NodeType, readonly NodeType[]> = {
  stack: [
    "stack",
    "columns",
    "text",
    "image",
    "button",
    "spacer",
    "divider",
    "form",
    "coupon",
    "countdown",
    "close",
  ],
  columns: ["stack"],
  form: ["field", "button", "text"],
  text: [],
  image: [],
  button: [],
  spacer: [],
  divider: [],
  field: [],
  coupon: [],
  countdown: [],
  close: [],
};

export const NODE_LABELS: Record<NodeType, string> = {
  stack: "Stack",
  columns: "Columns",
  text: "Text",
  image: "Image",
  button: "Button",
  spacer: "Spacer",
  divider: "Divider",
  form: "Form",
  field: "Field",
  coupon: "Coupon",
  countdown: "Countdown",
  close: "Close",
};

export function canContain(
  parent: NodeType,
  child: NodeType,
  goal: Goal,
): boolean {
  if (child === "coupon" && goal !== "discount") return false;
  return CONTAINMENT[parent].includes(child);
}

export function emptyCustomerState(): CustomerState {
  return { popups: {}, codes: {} };
}
