import {
  DEFAULT_TOKENS,
  SCHEMA_VERSION,
  type Behavior,
  type EditorDocument,
  type EditorNode,
  type PopupKind,
  type Tokens,
} from "./types";

export type PopupDraft = {
  name: string;
  kind: PopupKind;
  document: EditorDocument;
  behavior: Behavior;
};

function id(): string {
  return crypto.randomUUID();
}

function node(
  type: EditorNode["type"],
  parentId: string | null,
  name: string,
  props: EditorNode["props"] = {},
  style: EditorNode["style"] = {},
): EditorNode {
  return {
    id: id(),
    type,
    parentId,
    childIds: [],
    props,
    style,
    locked: false,
    name,
  };
}

function attach(parent: EditorNode, children: EditorNode[]): EditorNode[] {
  parent.childIds = children.map((child) => child.id);
  return [parent, ...children];
}

function documentFrom(tokens: Tokens, root: EditorNode, rest: EditorNode[]): EditorDocument {
  const nodes: Record<string, EditorNode> = { [root.id]: root };
  for (const entry of rest) nodes[entry.id] = entry;
  return { schemaVersion: SCHEMA_VERSION, rootId: root.id, tokens, nodes };
}

function baseBehavior(goal: Behavior["goal"], presentation: Behavior["presentation"]): Behavior {
  return {
    presentation,
    trigger: { type: "immediate" },
    frequency: { type: "once" },
    schedule: { start: null, end: null },
    targeting: {
      devices: ["desktop", "mobile"],
      include: [],
      exclude: [],
      templates: [],
    },
    goal,
    priority: 0,
    discount: null,
  };
}

function modalShell(
  tokens: Tokens,
  title: string,
  body: string,
  rootChildren: EditorNode[],
  nested: EditorNode[] = [],
): EditorDocument {
  const root = node("stack", null, "Popup", {}, {
    direction: "column",
    gap: 16,
    align: "stretch",
    padding: 28,
  });
  const close = node("close", root.id, "Close");
  const heading = node("text", root.id, "Heading", { content: title, variant: "heading" });
  const copy = node("text", root.id, "Body", { content: body, variant: "body" });
  for (const child of rootChildren) child.parentId = root.id;
  const all = attach(root, [close, heading, copy, ...rootChildren]);
  return documentFrom(tokens, all[0], [...all.slice(1), ...nested]);
}

export function createPreset(kind: PopupKind): PopupDraft {
  if (kind === "announcement") {
    const tokens = { ...DEFAULT_TOKENS, background: "#111111", text: "#ffffff", accent: "#ffffff", width: 440 };
    const root = node("stack", null, "Bar", {}, {
      direction: "row",
      gap: 16,
      align: "center",
      padding: 14,
    });
    const copy = node("text", root.id, "Message", {
      content: "Free shipping on orders over $75",
      variant: "body",
    });
    const button = node("button", root.id, "Link", { label: "Shop now", href: "/collections/all" });
    const all = attach(root, [copy, button]);
    return {
      name: "Announcement bar",
      kind,
      document: documentFrom(tokens, all[0], all.slice(1)),
      behavior: {
        ...baseBehavior("none", "bar"),
        trigger: { type: "immediate" },
        frequency: { type: "always" },
      },
    };
  }

  if (kind === "discount") {
    const behavior = baseBehavior("discount", "modal");
    behavior.trigger = { type: "delay", seconds: 3 };
    behavior.discount = {
      mode: "shared",
      percentage: 10,
      code: null,
      shopifyDiscountId: null,
    };
    const coupon = node("coupon", null, "Coupon", { label: "Your code", code: "" });
    const button = node("button", null, "Button", { label: "Shop the sale", href: "/collections/all" });
    return {
      name: "Discount reveal",
      kind,
      document: modalShell(DEFAULT_TOKENS, "Take 10% off", "Use this code at checkout.", [coupon, button]),
      behavior,
    };
  }

  const form = node("form", null, "Form", { consentLabel: "Email me offers and updates." });
  const field = node("field", form.id, "Email field", {
    label: "Email",
    placeholder: "you@email.com",
    name: "email",
  });
  const submit = node("button", form.id, "Submit", { label: "Get the offer", href: "" });
  form.childIds = [field.id, submit.id];
  const title = kind === "exit" ? "Wait — here's 10% off" : "Join the list";
  const body =
    kind === "exit"
      ? "Leave your email and we'll send the code."
      : "Be first to hear about new drops and private offers.";
  const behavior = baseBehavior("email", "modal");
  behavior.trigger = kind === "exit" ? { type: "exit" } : { type: "delay", seconds: 5 };
  return {
    name: kind === "exit" ? "Exit intent" : "Email capture",
    kind,
    document: modalShell(DEFAULT_TOKENS, title, body, [form], [field, submit]),
    behavior,
  };
}

export function isPopupKind(value: unknown): value is PopupKind {
  return value === "email" || value === "discount" || value === "exit" || value === "announcement";
}
