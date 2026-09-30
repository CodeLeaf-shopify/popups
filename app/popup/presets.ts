import {
  SCHEMA_VERSION,
  type Behavior,
  type EditorDocument,
  type EditorNode,
  type Tokens,
} from "./types";

export type TemplateId = "blank" | "email" | "discount" | "exit" | "announcement";

export type PopupDraft = {
  name: string;
  template: TemplateId;
  document: EditorDocument;
  behavior: Behavior;
};

export const TEMPLATES: { id: Exclude<TemplateId, "blank">; label: string; detail: string }[] = [
  { id: "email", label: "Email capture", detail: "Modal with a signup form" },
  { id: "discount", label: "Discount reveal", detail: "Modal with a discount code" },
  { id: "exit", label: "Exit intent", detail: "Modal that waits for exit" },
  { id: "announcement", label: "Announcement bar", detail: "Bar across the top of the page" },
];

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

function documentFrom(tokens: Partial<Tokens>, root: EditorNode, rest: EditorNode[]): EditorDocument {
  const nodes: Record<string, EditorNode> = { [root.id]: root };
  for (const entry of rest) nodes[entry.id] = entry;
  return { schemaVersion: SCHEMA_VERSION, rootId: root.id, tokens, nodes };
}

function baseBehavior(presentation: Behavior["presentation"]): Behavior {
  return {
    presentation,
    barPosition: "top",
    trigger: { type: "immediate" },
    frequency: { type: "once" },
    schedule: { start: null, end: null },
    targeting: {
      devices: ["desktop", "mobile"],
      include: [],
      exclude: [],
      templates: [],
      hideForLoggedIn: false,
    },
    priority: 0,
    discount: null,
  };
}

function modalShell(
  tokens: Partial<Tokens>,
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

export function createFromTemplate(template: TemplateId): PopupDraft {
  if (template === "blank") {
    const root = node("stack", null, "Popup", {}, {
      direction: "column",
      gap: 16,
      align: "stretch",
      padding: 28,
    });
    const all = attach(root, [node("close", root.id, "Close")]);
    return {
      name: "Untitled popup",
      template,
      document: documentFrom({}, all[0], all.slice(1)),
      behavior: baseBehavior("modal"),
    };
  }

  if (template === "announcement") {
    const tokens: Partial<Tokens> = { background: "#111111", text: "#ffffff", accent: "#ffffff" };
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
      template,
      document: documentFrom(tokens, all[0], all.slice(1)),
      behavior: {
        ...baseBehavior("bar"),
        trigger: { type: "immediate" },
        frequency: { type: "always" },
      },
    };
  }

  if (template === "discount") {
    const behavior = baseBehavior("modal");
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
      template,
      document: modalShell({}, "Take 10% off", "Use this code at checkout.", [coupon, button]),
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
  const title = template === "exit" ? "Wait — here's 10% off" : "Join the list";
  const body =
    template === "exit"
      ? "Leave your email and we'll send the code."
      : "Be first to hear about new drops and private offers.";
  const behavior = baseBehavior("modal");
  behavior.trigger = template === "exit" ? { type: "exit" } : { type: "delay", seconds: 5 };
  return {
    name: template === "exit" ? "Exit intent" : "Email capture",
    template,
    document: modalShell({}, title, body, [form], [field, submit]),
    behavior,
  };
}

export function isTemplateId(value: unknown): value is TemplateId {
  return value === "blank" || TEMPLATES.some((template) => template.id === value);
}
