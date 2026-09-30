import { NODE_LABELS, type EditorDocument } from "../popup/types";

type LayersPanelProps = {
  document: EditorDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function LayersPanel({ document, selectedId, onSelect }: LayersPanelProps) {
  return (
    <s-stack direction="block" gap="small-500">
      <LayerRow document={document} nodeId={document.rootId} selectedId={selectedId} onSelect={onSelect} />
    </s-stack>
  );
}

function LayerRow({
  document,
  nodeId,
  selectedId,
  onSelect,
}: LayersPanelProps & { nodeId: string }) {
  const node = document.nodes[nodeId];
  if (!node) return null;
  const selected = node.id === selectedId;
  return (
    <>
      <s-clickable
        onClick={() => onSelect(node.id)}
        background={selected ? "strong" : "transparent"}
        padding="small-200"
        borderRadius="base"
        accessibilityLabel={`Select ${node.name}`}
      >
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text type={selected ? "strong" : "generic"}>{node.name}</s-text>
          {node.name !== NODE_LABELS[node.type] ? <s-text color="subdued">{NODE_LABELS[node.type]}</s-text> : null}
        </s-stack>
      </s-clickable>
      {node.childIds.length > 0 ? (
        <s-box paddingInlineStart="base">
          <s-stack direction="block" gap="small-500">
            {node.childIds.map((childId) => (
              <LayerRow
                key={childId}
                document={document}
                nodeId={childId}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </s-stack>
        </s-box>
      ) : null}
    </>
  );
}
