import type { EditorNode, NodeType } from "./types";

export function canContain(parent: NodeType, child: NodeType) {
  const allowed: Record<NodeType, readonly NodeType[]> = {
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
  return allowed[parent].includes(child);
}

export function createDefaultNode(
  id: string,
  type: NodeType,
  parentId: string | null,
  name?: string,
): EditorNode {
  const defaults: Record<
    NodeType,
    { name: string; props: EditorNode["props"]; style: EditorNode["style"] }
  > = {
    stack: {
      name: "Stack",
      props: {},
      style: { direction: "column", gap: 12, align: "stretch", padding: 0 },
    },
    columns: {
      name: "Columns",
      props: {},
      style: { gap: 12 },
    },
    text: {
      name: "Text",
      props: { content: "Text", variant: "body" },
      style: { align: "center" },
    },
    image: {
      name: "Image",
      props: { src: "", alt: "" },
      style: {},
    },
    button: {
      name: "Button",
      props: { label: "Continue", href: "" },
      style: {},
    },
    spacer: {
      name: "Spacer",
      props: {},
      style: { size: 16 },
    },
    divider: {
      name: "Divider",
      props: {},
      style: {},
    },
    form: {
      name: "Form",
      props: { consentLabel: "Email me offers and updates" },
      style: { gap: 10 },
    },
    field: {
      name: "Email field",
      props: { label: "Email", placeholder: "you@email.com", name: "email" },
      style: {},
    },
    coupon: {
      name: "Coupon",
      props: { label: "Your code", code: "" },
      style: {},
    },
    countdown: {
      name: "Countdown",
      props: { endsAt: "" },
      style: {},
    },
    close: {
      name: "Close",
      props: {},
      style: {},
    },
  };

  const preset = defaults[type];
  return {
    id,
    type,
    parentId,
    childIds: [],
    props: { ...preset.props },
    style: { ...preset.style },
    locked: false,
    name: name ?? preset.name,
  };
}

export function isDescendant(
  nodes: Record<string, EditorNode>,
  ancestorId: string,
  maybeChildId: string,
) {
  const ancestor = nodes[ancestorId];
  if (!ancestor) return false;
  const stack = [...ancestor.childIds];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (id === maybeChildId) return true;
    const node = nodes[id];
    if (node) stack.push(...node.childIds);
  }
  return false;
}
