import { useState } from "react";

import { canContain, NODE_LABELS, NODE_TYPES, type Behavior, type Command, type EditorDocument, type NodeType } from "../popup/types";

type PropertyPanelProps = {
  document: EditorDocument;
  behavior: Behavior;
  selectedId: string | null;
  commandError: string | null;
  onCommand: (command: Command, coalesceKey?: string) => void;
  onBehavior: (behavior: Behavior, coalesceKey?: string) => void;
};

function valueOf(event: Event): string {
  const target = event.currentTarget as { value?: string } | null;
  return target?.value ?? "";
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function PropertyPanel({
  document,
  behavior,
  selectedId,
  commandError,
  onCommand,
  onBehavior,
}: PropertyPanelProps) {
  const selected = selectedId ? document.nodes[selectedId] : null;
  const parent = selected?.parentId ? document.nodes[selected.parentId] : null;
  const addTypes = selected
    ? NODE_TYPES.filter((type) => canContain(selected.type, type, behavior.goal))
    : [];
  const siblingIndex = parent && selected ? parent.childIds.indexOf(selected.id) : -1;

  return (
    <s-stack direction="block" gap="base">
      {commandError ? <s-banner tone="critical">{commandError}</s-banner> : null}

      <s-heading>Popup</s-heading>
      <s-select
        label="Shows as"
        value={behavior.presentation}
        onChange={(event) =>
          onBehavior(
            { ...behavior, presentation: valueOf(event) === "bar" ? "bar" : "modal" },
            "presentation",
          )
        }
      >
        <s-option value="modal">Modal</s-option>
        <s-option value="bar">Announcement bar</s-option>
      </s-select>
      <s-select
        label="Goal"
        value={behavior.goal}
        onChange={(event) => {
          const goal = valueOf(event);
          const nextGoal = goal === "email" || goal === "discount" ? goal : "none";
          onBehavior(
            {
              ...behavior,
              goal: nextGoal,
              discount:
                nextGoal === "discount"
                  ? behavior.discount ?? {
                      mode: "shared",
                      percentage: 10,
                      code: null,
                      shopifyDiscountId: null,
                    }
                  : null,
            },
            "goal",
          );
        }}
      >
        <s-option value="none">Announcement</s-option>
        <s-option value="email">Email capture</s-option>
        <s-option value="discount">Discount</s-option>
      </s-select>
      <s-select
        label="Trigger"
        value={behavior.trigger.type}
        onChange={(event) => {
          const type = valueOf(event);
          const trigger =
            type === "delay"
              ? { type: "delay" as const, seconds: 5 }
              : type === "scroll"
                ? { type: "scroll" as const, percent: 40 }
                : type === "exit"
                  ? { type: "exit" as const }
                  : { type: "immediate" as const };
          onBehavior({ ...behavior, trigger }, "trigger");
        }}
      >
        <s-option value="immediate">Immediately</s-option>
        <s-option value="delay">After a delay</s-option>
        <s-option value="scroll">After scroll</s-option>
        <s-option value="exit">Exit intent</s-option>
      </s-select>
      {behavior.trigger.type === "delay" ? (
        <s-text-field
          label="Delay in seconds"
          value={String(behavior.trigger.seconds)}
          onInput={(event) =>
            onBehavior(
              { ...behavior, trigger: { type: "delay", seconds: numberValue(valueOf(event), 0) } },
              "delay",
            )
          }
        />
      ) : null}
      {behavior.trigger.type === "scroll" ? (
        <s-text-field
          label="Scroll percent"
          value={String(behavior.trigger.percent)}
          onInput={(event) =>
            onBehavior(
              { ...behavior, trigger: { type: "scroll", percent: numberValue(valueOf(event), 0) } },
              "scroll",
            )
          }
        />
      ) : null}
      <s-select
        label="Frequency"
        value={behavior.frequency.type}
        onChange={(event) => {
          const type = valueOf(event);
          const frequency =
            type === "once"
              ? { type: "once" as const }
              : type === "days"
                ? { type: "days" as const, days: 7 }
                : { type: "always" as const };
          onBehavior({ ...behavior, frequency }, "frequency");
        }}
      >
        <s-option value="always">Every visit</s-option>
        <s-option value="once">Once</s-option>
        <s-option value="days">Every few days</s-option>
      </s-select>
      {behavior.frequency.type === "days" ? (
        <s-text-field
          label="Days between views"
          value={String(behavior.frequency.days)}
          onInput={(event) =>
            onBehavior(
              { ...behavior, frequency: { type: "days", days: numberValue(valueOf(event), 1) } },
              "days",
            )
          }
        />
      ) : null}
      <s-text-field
        label="Priority"
        value={String(behavior.priority)}
        details="Higher numbers win when more than one popup matches."
        onInput={(event) =>
          onBehavior({ ...behavior, priority: numberValue(valueOf(event), 0) }, "priority")
        }
      />
      <s-text-field
        label="Include paths"
        value={behavior.targeting.include.join(", ")}
        details="Comma-separated. Leave blank for every page."
        onInput={(event) =>
          onBehavior(
            {
              ...behavior,
              targeting: { ...behavior.targeting, include: splitList(valueOf(event)) },
            },
            "include",
          )
        }
      />
      <s-text-field
        label="Exclude paths"
        value={behavior.targeting.exclude.join(", ")}
        onInput={(event) =>
          onBehavior(
            {
              ...behavior,
              targeting: { ...behavior.targeting, exclude: splitList(valueOf(event)) },
            },
            "exclude",
          )
        }
      />
      {behavior.goal === "discount" && behavior.discount ? (
        <s-stack direction="block" gap="base">
          <s-select
            label="Discount codes"
            value={behavior.discount.mode}
            onChange={(event) =>
              onBehavior(
                {
                  ...behavior,
                  discount: {
                    ...behavior.discount!,
                    mode: valueOf(event) === "unique" ? "unique" : "shared",
                  },
                },
                "discount-mode",
              )
            }
          >
            <s-option value="shared">One public code</s-option>
            <s-option value="unique">Unique code per customer</s-option>
          </s-select>
          <s-text-field
            label="Percent off"
            value={String(behavior.discount.percentage)}
            onInput={(event) =>
              onBehavior(
                {
                  ...behavior,
                  discount: {
                    ...behavior.discount!,
                    percentage: numberValue(valueOf(event), 10),
                  },
                },
                "discount-percent",
              )
            }
          />
          {behavior.discount.mode === "shared" ? (
            <s-text-field
              label="Code"
              value={behavior.discount.code ?? ""}
              details="Leave blank to generate a code when you publish."
              onInput={(event) =>
                onBehavior(
                  {
                    ...behavior,
                    discount: {
                      ...behavior.discount!,
                      code: valueOf(event).trim() || null,
                    },
                  },
                  "discount-code",
                )
              }
            />
          ) : null}
        </s-stack>
      ) : null}

      <s-divider />
      <s-heading>Colors and type</s-heading>
      <s-text-field
        label="Background"
        value={document.tokens.background}
        onInput={(event) =>
          onCommand({ type: "updateTokens", tokens: { background: valueOf(event) } }, "token-background")
        }
      />
      <s-text-field
        label="Text"
        value={document.tokens.text}
        onInput={(event) =>
          onCommand({ type: "updateTokens", tokens: { text: valueOf(event) } }, "token-text")
        }
      />
      <s-text-field
        label="Accent"
        value={document.tokens.accent}
        onInput={(event) =>
          onCommand({ type: "updateTokens", tokens: { accent: valueOf(event) } }, "token-accent")
        }
      />
      <s-text-field
        label="Overlay"
        value={document.tokens.overlay}
        onInput={(event) =>
          onCommand({ type: "updateTokens", tokens: { overlay: valueOf(event) } }, "token-overlay")
        }
      />
      <s-text-field
        label="Width"
        value={String(document.tokens.width)}
        onInput={(event) =>
          onCommand(
            { type: "updateTokens", tokens: { width: numberValue(valueOf(event), 440) } },
            "token-width",
          )
        }
      />
      <s-text-field
        label="Corner radius"
        value={String(document.tokens.radius)}
        onInput={(event) =>
          onCommand(
            { type: "updateTokens", tokens: { radius: numberValue(valueOf(event), 16) } },
            "token-radius",
          )
        }
      />
      <s-text-field
        label="Font"
        value={document.tokens.font}
        onInput={(event) =>
          onCommand({ type: "updateTokens", tokens: { font: valueOf(event) } }, "token-font")
        }
      />

      {selected ? (
        <s-stack direction="block" gap="base">
          <s-divider />
          <s-heading>{selected.name}</s-heading>
          <s-text>{NODE_LABELS[selected.type]}</s-text>
          <NodeFields
            nodeId={selected.id}
            type={selected.type}
            nodeProps={selected.props}
            style={selected.style}
            onCommand={onCommand}
          />
          {addTypes.length > 0 ? (
            <AddBlock
              types={addTypes}
              onAdd={(nodeType) =>
                onCommand({
                  type: "insert",
                  parentId: selected.id,
                  index: selected.childIds.length,
                  nodeType,
                })
              }
            />
          ) : null}
          {parent && selected.id !== document.rootId ? (
            <s-stack direction="inline" gap="base">
              <s-button
                onClick={() =>
                  onCommand({
                    type: "move",
                    nodeId: selected.id,
                    parentId: parent.id,
                    index: siblingIndex - 1,
                  })
                }
              >
                Move up
              </s-button>
              <s-button
                onClick={() =>
                  onCommand({
                    type: "move",
                    nodeId: selected.id,
                    parentId: parent.id,
                    index: siblingIndex + 1,
                  })
                }
              >
                Move down
              </s-button>
              <s-button onClick={() => onCommand({ type: "duplicate", nodeId: selected.id })}>
                Duplicate
              </s-button>
              <s-button tone="critical" onClick={() => onCommand({ type: "delete", nodeId: selected.id })}>
                Delete
              </s-button>
            </s-stack>
          ) : null}
        </s-stack>
      ) : (
        <s-paragraph>Select a block in the preview to edit it.</s-paragraph>
      )}
    </s-stack>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function AddBlock({ types, onAdd }: { types: NodeType[]; onAdd: (type: NodeType) => void }) {
  const [nodeType, setNodeType] = useState<NodeType>(types[0]);
  const selected = types.includes(nodeType) ? nodeType : types[0];
  return (
    <s-stack direction="inline" gap="base">
      <s-select label="Add block" value={selected} onChange={(event) => setNodeType(valueOf(event) as NodeType)}>
        {types.map((type) => (
          <s-option key={type} value={type}>
            {NODE_LABELS[type]}
          </s-option>
        ))}
      </s-select>
      <s-button onClick={() => onAdd(selected)}>Add</s-button>
    </s-stack>
  );
}

function NodeFields({
  nodeId,
  type,
  nodeProps,
  style,
  onCommand,
}: {
  nodeId: string;
  type: NodeType;
  nodeProps: Record<string, string | number | boolean>;
  style: Record<string, string | number>;
  onCommand: (command: Command, coalesceKey?: string) => void;
}) {
  const setProp = (key: string, value: string | number | boolean) =>
    onCommand({ type: "updateProps", nodeId, props: { [key]: value } }, `${nodeId}:${key}`);
  const setStyle = (key: string, value: string | number) =>
    onCommand({ type: "updateStyle", nodeId, style: { [key]: value } }, `${nodeId}:style:${key}`);

  if (type === "text") {
    return (
      <s-stack direction="block" gap="base">
        <s-text-area
          label="Content"
          value={String(nodeProps.content ?? "")}
          onInput={(event) => setProp("content", valueOf(event))}
        />
        <s-select
          label="Style"
          value={String(nodeProps.variant ?? "body")}
          onChange={(event) => setProp("variant", valueOf(event))}
        >
          <s-option value="heading">Heading</s-option>
          <s-option value="body">Body</s-option>
        </s-select>
      </s-stack>
    );
  }

  if (type === "image") {
    return (
      <s-stack direction="block" gap="base">
        <s-text-field label="Image URL" value={String(nodeProps.src ?? "")} onInput={(event) => setProp("src", valueOf(event))} />
        <s-text-field label="Alt text" value={String(nodeProps.alt ?? "")} onInput={(event) => setProp("alt", valueOf(event))} />
      </s-stack>
    );
  }

  if (type === "button") {
    return (
      <s-stack direction="block" gap="base">
        <s-text-field label="Label" value={String(nodeProps.label ?? "")} onInput={(event) => setProp("label", valueOf(event))} />
        <s-text-field
          label="Link"
          details="Leave blank when this button submits a form."
          value={String(nodeProps.href ?? "")}
          onInput={(event) => setProp("href", valueOf(event))}
        />
      </s-stack>
    );
  }

  if (type === "field") {
    return (
      <s-stack direction="block" gap="base">
        <s-text-field label="Label" value={String(nodeProps.label ?? "")} onInput={(event) => setProp("label", valueOf(event))} />
        <s-text-field
          label="Placeholder"
          value={String(nodeProps.placeholder ?? "")}
          onInput={(event) => setProp("placeholder", valueOf(event))}
        />
      </s-stack>
    );
  }

  if (type === "form") {
    return (
      <s-text-field
        label="Consent label"
        details="Shown as a checkbox. Leave blank to skip consent."
        value={String(nodeProps.consentLabel ?? "")}
        onInput={(event) => setProp("consentLabel", valueOf(event))}
      />
    );
  }

  if (type === "coupon") {
    return <s-text-field label="Label" value={String(nodeProps.label ?? "")} onInput={(event) => setProp("label", valueOf(event))} />;
  }

  if (type === "countdown") {
    return (
      <s-text-field
        label="Ends at"
        details="ISO date, for example 2026-12-01T00:00:00.000Z"
        value={String(nodeProps.endsAt ?? "")}
        onInput={(event) => setProp("endsAt", valueOf(event))}
      />
    );
  }

  if (type === "spacer") {
    return (
      <s-text-field
        label="Height"
        value={String(style.size ?? 16)}
        onInput={(event) => setStyle("size", numberValue(valueOf(event), 16))}
      />
    );
  }

  if (type === "columns") {
    return (
      <s-text-field
        label="Gap"
        value={String(style.gap ?? 12)}
        onInput={(event) => setStyle("gap", numberValue(valueOf(event), 12))}
      />
    );
  }

  if (type === "stack") {
    return (
      <s-stack direction="block" gap="base">
        <s-select
          label="Direction"
          value={String(style.direction ?? "column")}
          onChange={(event) => setStyle("direction", valueOf(event))}
        >
          <s-option value="column">Vertical</s-option>
          <s-option value="row">Horizontal</s-option>
        </s-select>
        <s-text-field
          label="Gap"
          value={String(style.gap ?? 12)}
          onInput={(event) => setStyle("gap", numberValue(valueOf(event), 12))}
        />
        <s-text-field
          label="Padding"
          value={String(style.padding ?? 0)}
          onInput={(event) => setStyle("padding", numberValue(valueOf(event), 0))}
        />
      </s-stack>
    );
  }

  return null;
}
