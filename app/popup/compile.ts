import {
  canContain,
  resolveTokens,
  SCHEMA_VERSION,
  type Behavior,
  type CompiledNode,
  type EditorDocument,
  type StorefrontPayload,
  type Tokens,
} from "./types";

export type CompileResult =
  | { ok: true; payload: StorefrontPayload }
  | { ok: false; error: string };

function publicBehavior(behavior: Behavior): Behavior {
  if (!behavior.discount) return behavior;
  return {
    ...behavior,
    discount: { ...behavior.discount, shopifyDiscountId: null },
  };
}

function compileNode(
  document: EditorDocument,
  id: string,
  behavior: Behavior,
  seen: Set<string>,
): CompiledNode {
  if (seen.has(id)) throw new Error("The popup contains a circular block.");
  const node = document.nodes[id];
  if (!node) throw new Error("The popup is missing a block.");
  seen.add(id);

  if (node.parentId) {
    const parent = document.nodes[node.parentId];
    if (parent && !canContain(parent.type, node.type)) {
      throw new Error(`“${node.name}” is not allowed inside “${parent.name}”.`);
    }
  }

  const props = { ...node.props };
  if (
    node.type === "coupon" &&
    behavior.discount?.mode === "shared" &&
    behavior.discount.code
  ) {
    props.code = behavior.discount.code;
  }

  const children = node.childIds.map((childId) =>
    compileNode(document, childId, behavior, seen),
  );
  const compiled: CompiledNode = {
    id: node.id,
    type: node.type,
    props,
    style: { ...node.style },
  };
  if (children.length > 0) compiled.children = children;
  return compiled;
}

export function compile(
  document: EditorDocument,
  behavior: Behavior,
  globalTokens: Tokens,
): CompileResult {
  try {
    if (!document.nodes[document.rootId]) {
      return { ok: false, error: "The popup has no root block." };
    }
    const root = compileNode(document, document.rootId, behavior, new Set());
    const payload: StorefrontPayload = {
      schemaVersion: SCHEMA_VERSION,
      document: {
        schemaVersion: SCHEMA_VERSION,
        kind: behavior.presentation,
        position: behavior.barPosition === "bottom" ? "bottom" : "top",
        tokens: resolveTokens(globalTokens, document.tokens),
        root,
      },
      behavior: publicBehavior(behavior),
    };
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The popup could not be compiled.",
    };
  }
}
