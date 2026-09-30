import {
  canContain,
  NODE_LABELS,
  type Command,
  type EditorDocument,
  type EditorNode,
  type NodeProps,
  type NodeStyle,
  type NodeType,
} from "./types";

export type CommandResult = {
  document: EditorDocument;
  error?: string;
  insertedId?: string;
};

function nodeId(): string {
  return crypto.randomUUID();
}

function defaultProps(type: NodeType): NodeProps {
  switch (type) {
    case "text":
      return { content: "Text", variant: "body" };
    case "image":
      return { src: "", alt: "" };
    case "button":
      return { label: "Button", href: "" };
    case "field":
      return { label: "Email", placeholder: "you@email.com", name: "email" };
    case "coupon":
      return { label: "Your code", code: "" };
    case "countdown":
      return { endsAt: "" };
    case "form":
      return { consentLabel: "" };
    case "close":
      return {};
    default:
      return {};
  }
}

function defaultStyle(type: NodeType): NodeStyle {
  switch (type) {
    case "stack":
      return { direction: "column", gap: 12, align: "stretch", padding: 0 };
    case "form":
      return { direction: "column", gap: 12, align: "stretch", padding: 0 };
    case "spacer":
      return { size: 16 };
    case "columns":
      return { gap: 12 };
    default:
      return {};
  }
}

function createNode(
  type: NodeType,
  parentId: string | null,
  name = NODE_LABELS[type],
): EditorNode {
  return {
    id: nodeId(),
    type,
    parentId,
    childIds: [],
    props: defaultProps(type),
    style: defaultStyle(type),
    locked: false,
    name,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isDescendant(
  document: EditorDocument,
  ancestorId: string,
  maybeChildId: string,
): boolean {
  const stack = [...(document.nodes[ancestorId]?.childIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    if (id === maybeChildId) return true;
    const node = document.nodes[id];
    if (node) stack.push(...node.childIds);
  }
  return false;
}

function mergeDefined<T extends Record<string, string | number | boolean>>(
  base: T,
  patch: Partial<T>,
): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key as keyof T] = value as T[keyof T];
  }
  return next;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

function withChildren(
  node: EditorNode,
  type: NodeType,
  nodes: Record<string, EditorNode>,
): EditorNode {
  if (type === "columns") {
    const left = createNode("stack", node.id, "Column");
    const right = createNode("stack", node.id, "Column");
    left.style = { direction: "column", gap: 8, align: "stretch", padding: 0 };
    right.style = { direction: "column", gap: 8, align: "stretch", padding: 0 };
    nodes[left.id] = left;
    nodes[right.id] = right;
    node.childIds = [left.id, right.id];
  }
  if (type === "form") {
    const field = createNode("field", node.id, "Email field");
    const button = createNode("button", node.id, "Submit");
    button.props = { label: "Subscribe", href: "" };
    nodes[field.id] = field;
    nodes[button.id] = button;
    node.childIds = [field.id, button.id];
  }
  return node;
}

function insertNode(
  document: EditorDocument,
  parentId: string,
  index: number,
  type: NodeType,
): CommandResult {
  const parent = document.nodes[parentId];
  if (!parent) return { document, error: "That container no longer exists." };
  if (!canContain(parent.type, type)) {
    return { document, error: `${NODE_LABELS[type]} cannot go inside ${NODE_LABELS[parent.type]}.` };
  }

  const nodes = clone(document.nodes);
  const node = withChildren(createNode(type, parentId), type, nodes);
  nodes[node.id] = node;
  const childIds = nodes[parentId].childIds.slice();
  childIds.splice(clampIndex(index, childIds.length), 0, node.id);
  nodes[parentId] = { ...nodes[parentId], childIds };
  return { document: { ...document, nodes }, insertedId: node.id };
}

function moveNode(
  document: EditorDocument,
  nodeId: string,
  parentId: string,
  index: number,
): CommandResult {
  const node = document.nodes[nodeId];
  const parent = document.nodes[parentId];
  if (!node || !parent || !node.parentId) {
    return { document, error: "That block cannot be moved." };
  }
  if (nodeId === document.rootId) {
    return { document, error: "The root block stays in place." };
  }
  if (node.locked) return { document, error: "That block is locked." };
  if (nodeId === parentId || isDescendant(document, nodeId, parentId)) {
    return { document, error: "A block cannot be moved inside itself." };
  }
  if (!canContain(parent.type, node.type)) {
    return { document, error: `${NODE_LABELS[node.type]} cannot go inside ${NODE_LABELS[parent.type]}.` };
  }

  const nodes = clone(document.nodes);
  const oldParent = nodes[node.parentId];
  const removed = oldParent.childIds.filter((id) => id !== nodeId);
  const targetIds = oldParent.id === parent.id ? removed : nodes[parent.id].childIds.slice();
  targetIds.splice(clampIndex(index, targetIds.length), 0, nodeId);
  nodes[oldParent.id] = {
    ...oldParent,
    childIds: oldParent.id === parent.id ? targetIds : removed,
  };
  if (oldParent.id !== parent.id) {
    nodes[parent.id] = { ...nodes[parent.id], childIds: targetIds };
  }
  nodes[nodeId] = { ...nodes[nodeId], parentId: parent.id };
  return { document: { ...document, nodes } };
}

function collectDescendants(document: EditorDocument, nodeId: string): string[] {
  const ids: string[] = [];
  const stack = [...(document.nodes[nodeId]?.childIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    ids.push(id);
    const node = document.nodes[id];
    if (node) stack.push(...node.childIds);
  }
  return ids;
}

function deleteNode(document: EditorDocument, nodeId: string): CommandResult {
  const node = document.nodes[nodeId];
  if (!node || !node.parentId) {
    return { document, error: "The root block cannot be deleted." };
  }
  if (node.locked) return { document, error: "That block is locked." };
  const nodes = clone(document.nodes);
  const parent = nodes[node.parentId];
  nodes[parent.id] = {
    ...parent,
    childIds: parent.childIds.filter((id) => id !== nodeId),
  };
  delete nodes[nodeId];
  for (const id of collectDescendants(document, nodeId)) delete nodes[id];
  return { document: { ...document, nodes } };
}

function duplicateNode(document: EditorDocument, sourceId: string): CommandResult {
  const node = document.nodes[sourceId];
  if (!node || !node.parentId) {
    return { document, error: "The root block cannot be duplicated." };
  }
  const nodes = clone(document.nodes);

  const copyTree = (id: string, parentId: string): string => {
    const current = document.nodes[id];
    const copy = clone(current);
    copy.id = nodeId();
    copy.parentId = parentId;
    copy.locked = false;
    copy.name = `${current.name} copy`;
    copy.childIds = current.childIds.map((childId) => copyTree(childId, copy.id));
    nodes[copy.id] = copy;
    return copy.id;
  };

  const copyId = copyTree(sourceId, node.parentId);
  const parent = nodes[node.parentId];
  const index = parent.childIds.indexOf(sourceId);
  const childIds = parent.childIds.slice();
  childIds.splice(index + 1, 0, copyId);
  nodes[parent.id] = { ...parent, childIds };
  return { document: { ...document, nodes }, insertedId: copyId };
}

export function applyCommand(document: EditorDocument, command: Command): CommandResult {
  switch (command.type) {
    case "insert":
      return insertNode(document, command.parentId, command.index, command.nodeType);
    case "move":
      return moveNode(document, command.nodeId, command.parentId, command.index);
    case "delete":
      return deleteNode(document, command.nodeId);
    case "duplicate":
      return duplicateNode(document, command.nodeId);
    case "updateProps": {
      const node = document.nodes[command.nodeId];
      if (!node) return { document, error: "That block no longer exists." };
      const nodes = clone(document.nodes);
      nodes[node.id] = { ...node, props: mergeDefined(node.props, command.props) };
      return { document: { ...document, nodes } };
    }
    case "updateStyle": {
      const node = document.nodes[command.nodeId];
      if (!node) return { document, error: "That block no longer exists." };
      const nodes = clone(document.nodes);
      nodes[node.id] = { ...node, style: mergeDefined(node.style, command.style) };
      return { document: { ...document, nodes } };
    }
    case "updateTokens":
      return {
        document: { ...document, tokens: { ...document.tokens, ...command.tokens } },
      };
    case "resetToken": {
      const tokens = { ...document.tokens };
      delete tokens[command.token];
      return { document: { ...document, tokens } };
    }
    default:
      return { document, error: "Unknown edit." };
  }
}

export function createBlankNode(type: NodeType, parentId: string): EditorNode {
  return createNode(type, parentId);
}
