interface EmbedSetupGuideProps {
  embedUrl: string;
}

export function EmbedSetupGuide({ embedUrl }: EmbedSetupGuideProps) {
  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        Popups render through one theme app embed. Turn it on once per theme, then every published popup uses it.
      </s-paragraph>
      <s-ordered-list>
        <s-list-item>
          Click <s-text type="strong">Enable Leaf Popups in the theme editor</s-text> below. The theme editor opens in
          a new tab on the App embeds panel.
        </s-list-item>
        <s-list-item>
          Make sure the <s-text type="strong">Leaf Popups</s-text> toggle is on. If it is off, switch it on.
        </s-list-item>
        <s-list-item>
          Click <s-text type="strong">Save</s-text> in the top right of the theme editor. The embed is not active until
          the theme is saved.
        </s-list-item>
        <s-list-item>
          Publish a popup in Leaf Popups, then open your storefront in a new tab. The popup shows when its trigger and
          page rules match.
        </s-list-item>
      </s-ordered-list>
      <s-link href={embedUrl} target="_blank">
        Enable Leaf Popups in the theme editor
      </s-link>
      <s-text color="subdued">
        Popups not showing? Check that the embed is on and saved in the theme your store is using, that the popup is
        published, that popups are not paused under Settings, and that preview mode or a password page is not hiding
        your storefront. If you switch themes, repeat these steps for the new theme.
      </s-text>
    </s-stack>
  );
}
