export function EmbedSetupGuide() {
  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        Popups render through one theme app embed. Turn it on once per theme, then every published popup uses it. The
        setup guide walks you through choosing a theme, turning the embed on, and saving.
      </s-paragraph>
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" href="/app/setup">
          Open setup guide
        </s-button>
      </s-stack>
    </s-stack>
  );
}
