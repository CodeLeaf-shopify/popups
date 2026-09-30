import {
  canContain,
  NODE_LABELS,
  NODE_TYPES,
  resolveTokens,
  type Behavior,
  type Command,
  type EditorDocument,
  type NodeType,
  type Tokens,
} from "../popup/types";
import { LayersPanel } from "./LayersPanel";

type PopupSettingsPanelProps = {
  behavior: Behavior;
  hiddenForLoggedInGlobally: boolean;
  onBehavior: (behavior: Behavior, coalesceKey?: string) => void;
};

type DesignPanelProps = {
  document: EditorDocument;
  behavior: Behavior;
  globalTokens: Tokens;
  onCommand: (command: Command, coalesceKey?: string) => void;
};

type StructurePanelProps = {
  document: EditorDocument;
  selectedId: string | null;
  commandError: string | null;
  onCommand: (command: Command, coalesceKey?: string) => void;
  onSelect: (id: string) => void;
};

function valueOf(event: Event): string {
  const target = event.currentTarget as { value?: string } | null;
  return target?.value ?? "";
}

type ColorTokenFieldProps = {
  id: string;
  label: string;
  value: string;
  alpha?: boolean;
  onValue: (value: string) => void;
};

export function ColorTokenField({ id, label, value, alpha = false, onValue }: ColorTokenFieldProps) {
  const popoverId = `${id}-picker`;
  return (
    <>
      <s-clickable
        commandFor={popoverId}
        accessibilityLabel={`Choose ${label.toLowerCase()}`}
        border="base"
        borderRadius="base"
        padding="base"
      >
        <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="base" alignItems="center">
          <s-thumbnail src={colorSwatch(value)} alt="" size="small" />
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{label}</s-text>
            <s-text color="subdued">{value}</s-text>
          </s-stack>
        </s-grid>
      </s-clickable>
      <s-popover id={popoverId} inlineSize="320px">
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            <s-color-picker
              value={value}
              {...(alpha ? { alpha: true } : {})}
              onInput={(event) => onValue(valueOf(event))}
              onChange={(event) => onValue(valueOf(event))}
            />
            <s-color-field
              label={`${label} color value`}
              value={value}
              {...(alpha ? { alpha: true } : {})}
              onInput={(event) => onValue(valueOf(event))}
            />
          </s-stack>
        </s-box>
      </s-popover>
    </>
  );
}

function colorSwatch(value: string): string {
  const safeColor =
    /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%degturnrad]+\))$/i.test(value)
      ? value
      : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="8" fill="${safeColor}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type NumberInputProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  details?: string;
  onValue: (value: number) => void;
};

export function NumberInput({ label, value, min, max, step = 1, suffix, details, onValue }: NumberInputProps) {
  const inRange = (next: number) => (min === undefined || next >= min) && (max === undefined || next <= max);
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
  return (
    <s-number-field
      label={label}
      value={String(value)}
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      {...(suffix ? { suffix } : {})}
      {...(details ? { details } : {})}
      onInput={(event) => {
        const raw = valueOf(event);
        const next = Number(raw);
        if (raw !== "" && Number.isFinite(next) && inRange(next)) onValue(next);
      }}
      onChange={(event) => {
        const next = Number(valueOf(event));
        onValue(Number.isFinite(next) ? clamp(next) : value);
      }}
    />
  );
}

export function StructurePanel({
  document,
  selectedId,
  commandError,
  onCommand,
  onSelect,
}: StructurePanelProps) {
  const selected = selectedId ? document.nodes[selectedId] : null;
  const parent = selected?.parentId ? document.nodes[selected.parentId] : null;
  const addTypes = selected
    ? NODE_TYPES.filter((type) => canContain(selected.type, type))
    : [];
  const siblingIndex = parent && selected ? parent.childIds.indexOf(selected.id) : -1;

  return (
    <s-stack direction="block" gap="base">
      <s-section heading={selected ? selected.name : "Selected block"}>
        <s-stack direction="block" gap="base">
          {commandError ? <s-banner tone="critical">{commandError}</s-banner> : null}
          {selected ? (
            <>
              <s-text color="subdued">{NODE_LABELS[selected.type]}</s-text>
              <NodeFields
                nodeId={selected.id}
                type={selected.type}
                nodeProps={selected.props}
                style={selected.style}
                onCommand={onCommand}
              />
              <s-stack direction="inline" gap="small-200">
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
                  <>
                    <s-button
                      icon="arrow-up"
                      accessibilityLabel="Move up"
                      {...(siblingIndex <= 0 ? { disabled: true } : {})}
                      onClick={() =>
                        onCommand({
                          type: "move",
                          nodeId: selected.id,
                          parentId: parent.id,
                          index: siblingIndex - 1,
                        })
                      }
                    />
                    <s-button
                      icon="arrow-down"
                      accessibilityLabel="Move down"
                      {...(siblingIndex >= parent.childIds.length - 1 ? { disabled: true } : {})}
                      onClick={() =>
                        onCommand({
                          type: "move",
                          nodeId: selected.id,
                          parentId: parent.id,
                          index: siblingIndex + 1,
                        })
                      }
                    />
                    <s-button
                      icon="duplicate"
                      accessibilityLabel="Duplicate"
                      onClick={() => onCommand({ type: "duplicate", nodeId: selected.id })}
                    />
                    <s-button
                      icon="delete"
                      tone="critical"
                      accessibilityLabel="Delete"
                      onClick={() => onCommand({ type: "delete", nodeId: selected.id })}
                    />
                  </>
                ) : null}
              </s-stack>
            </>
          ) : (
            <s-paragraph>Select a block in the preview or in Layers to edit it.</s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Layers">
        <LayersPanel document={document} selectedId={selectedId} onSelect={onSelect} />
      </s-section>
    </s-stack>
  );
}

export function PopupSettingsPanel({ behavior, hiddenForLoggedInGlobally, onBehavior }: PopupSettingsPanelProps) {
  return (
    <s-section heading="Popup settings">
        <s-stack direction="block" gap="base">
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
          {behavior.presentation === "bar" ? (
            <s-select
              label="Position"
              value={behavior.barPosition}
              onChange={(event) =>
                onBehavior(
                  { ...behavior, barPosition: valueOf(event) === "bottom" ? "bottom" : "top" },
                  "bar-position",
                )
              }
            >
              <s-option value="top">Top of page</s-option>
              <s-option value="bottom">Bottom of page</s-option>
            </s-select>
          ) : null}
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
            <NumberInput
              label="Delay"
              value={behavior.trigger.seconds}
              min={0}
              max={600}
              suffix="seconds"
              onValue={(seconds) => onBehavior({ ...behavior, trigger: { type: "delay", seconds } }, "delay")}
            />
          ) : null}
          {behavior.trigger.type === "scroll" ? (
            <NumberInput
              label="Scroll depth"
              value={behavior.trigger.percent}
              min={0}
              max={100}
              suffix="%"
              onValue={(percent) => onBehavior({ ...behavior, trigger: { type: "scroll", percent } }, "scroll")}
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
            <NumberInput
              label="Days between views"
              value={behavior.frequency.days}
              min={1}
              max={365}
              suffix="days"
              onValue={(days) => onBehavior({ ...behavior, frequency: { type: "days", days } }, "days")}
            />
          ) : null}
          <NumberInput
            label="Priority"
            value={behavior.priority}
            min={0}
            max={100}
            details="Higher numbers show first when more than one popup matches."
            onValue={(priority) => onBehavior({ ...behavior, priority }, "priority")}
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
          <s-checkbox
            label="Hide from logged-in customers"
            {...(hiddenForLoggedInGlobally || behavior.targeting.hideForLoggedIn ? { checked: true } : {})}
            {...(hiddenForLoggedInGlobally
              ? { disabled: true, details: "Hidden for all popups in Settings." }
              : {})}
            onChange={(event) => {
              const target = event.currentTarget as { checked?: boolean };
              onBehavior(
                {
                  ...behavior,
                  targeting: { ...behavior.targeting, hideForLoggedIn: target.checked === true },
                },
                "hide-logged-in",
              );
            }}
          />
          {behavior.discount ? (
            <>
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
              <NumberInput
                label="Percent off"
                value={behavior.discount.percentage}
                min={1}
                max={100}
                suffix="%"
                onValue={(percentage) =>
                  onBehavior({ ...behavior, discount: { ...behavior.discount!, percentage } }, "discount-percent")
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
            </>
          ) : null}
        </s-stack>
    </s-section>
  );
}

export function DesignPanel({ document, behavior, globalTokens, onCommand }: DesignPanelProps) {
  const tokens = resolveTokens(globalTokens, document.tokens);
  const reset = (token: keyof Tokens) =>
    token in document.tokens ? (
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge tone="info">Custom</s-badge>
        <s-button variant="tertiary" onClick={() => onCommand({ type: "resetToken", token })}>
          Reset to global
        </s-button>
      </s-stack>
    ) : null;
  return (
    <s-section heading="Design">
        <s-stack direction="block" gap="base">
          <s-text color="subdued">
            Unchanged values follow the default styles in Settings.
          </s-text>
          <ColorTokenField
            id="leaf-background-color"
            label="Background"
            value={tokens.background}
            onValue={(background) =>
              onCommand({ type: "updateTokens", tokens: { background } }, "token-background")
            }
          />
          {reset("background")}
          <ColorTokenField
            id="leaf-text-color"
            label="Text"
            value={tokens.text}
            onValue={(text) =>
              onCommand({ type: "updateTokens", tokens: { text } }, "token-text")
            }
          />
          {reset("text")}
          <ColorTokenField
            id="leaf-accent-color"
            label="Accent"
            value={tokens.accent}
            onValue={(accent) =>
              onCommand({ type: "updateTokens", tokens: { accent } }, "token-accent")
            }
          />
          {reset("accent")}
          {behavior.presentation === "modal" ? (
            <>
              <ColorTokenField
                id="leaf-overlay-color"
                label="Overlay"
                alpha
                value={tokens.overlay}
                onValue={(overlay) =>
                  onCommand({ type: "updateTokens", tokens: { overlay } }, "token-overlay")
                }
              />
              {reset("overlay")}
              <NumberInput
                label="Width"
                value={tokens.width}
                min={240}
                max={960}
                step={10}
                suffix="px"
                onValue={(width) => onCommand({ type: "updateTokens", tokens: { width } }, "token-width")}
              />
              {reset("width")}
            </>
          ) : null}
          <NumberInput
            label="Corner radius"
            value={tokens.radius}
            min={0}
            max={48}
            suffix="px"
            onValue={(radius) => onCommand({ type: "updateTokens", tokens: { radius } }, "token-radius")}
          />
          {reset("radius")}
          <s-text-field
            label="Font"
            value={tokens.font}
            onInput={(event) =>
              onCommand({ type: "updateTokens", tokens: { font: valueOf(event) } }, "token-font")
            }
          />
          {reset("font")}
        </s-stack>
    </s-section>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function AddBlock({ types, onAdd }: { types: NodeType[]; onAdd: (type: NodeType) => void }) {
  return (
    <>
      <s-button icon="plus" commandFor="add-block-menu">
        Add block
      </s-button>
      <s-menu id="add-block-menu" accessibilityLabel="Block types">
        {types.map((type) => (
          <s-button key={type} onClick={() => onAdd(type)}>
            {NODE_LABELS[type]}
          </s-button>
        ))}
      </s-menu>
    </>
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
        details="Shown as an optional checkbox. Leave blank to skip consent."
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
      <NumberInput
        label="Height"
        value={Number(style.size ?? 16)}
        min={0}
        max={200}
        suffix="px"
        onValue={(size) => setStyle("size", size)}
      />
    );
  }

  if (type === "columns") {
    return (
      <NumberInput
        label="Gap"
        value={Number(style.gap ?? 12)}
        min={0}
        max={96}
        suffix="px"
        onValue={(gap) => setStyle("gap", gap)}
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
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <NumberInput
            label="Gap"
            value={Number(style.gap ?? 12)}
            min={0}
            max={96}
            suffix="px"
            onValue={(gap) => setStyle("gap", gap)}
          />
          <NumberInput
            label="Padding"
            value={Number(style.padding ?? 0)}
            min={0}
            max={96}
            suffix="px"
            onValue={(padding) => setStyle("padding", padding)}
          />
        </s-grid>
      </s-stack>
    );
  }

  return null;
}
