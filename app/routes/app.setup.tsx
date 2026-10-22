import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { EMBED_HANDLE } from "../popup/types";
import { authenticate } from "../shopify.server";

interface ThemeOption {
  id: string;
  name: string;
  role: string;
}

const THEMES_QUERY = `#graphql
  query LeafPopupsThemes {
    themes(first: 50, roles: [MAIN, UNPUBLISHED, DEMO, DEVELOPMENT]) {
      nodes { id name role }
    }
  }
`;

const ROLE_LABELS: Record<string, string> = {
  MAIN: "Live",
  UNPUBLISHED: "Unpublished",
  DEMO: "Trial",
  DEVELOPMENT: "Development",
};

const SCREENSHOT = {
  src: "/onboarding/app-embeds.jpg",
  alt: "The App embeds panel in the Shopify theme editor with the Leaf Popups toggle switched on and a popup showing in the storefront preview. The Save button is in the top right.",
};

// Template names a theme app embed can render on. The embed targets the page body, so
// every Online Store template is covered; checkout and Shopify-hosted pages are not.
const TEMPLATES = [
  "Home page",
  "Product pages",
  "Collection pages",
  "Cart",
  "Search results",
  "Blog and article pages",
  "Custom pages",
  "Customer account pages",
  "404 page",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let themes: ThemeOption[] | null = null;
  try {
    const response = await admin.graphql(THEMES_QUERY);
    const { data } = (await response.json()) as { data?: { themes?: { nodes: ThemeOption[] } } };
    themes = data?.themes?.nodes ?? null;
  } catch {
    // The read_themes scope is granted on the next app update. Until then the setup
    // page falls back to the theme that is currently live.
    themes = null;
  }
  const ordered = themes
    ? [...themes].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN") || a.name.localeCompare(b.name))
    : null;
  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    themes: ordered,
  };
};

const themeNumericId = (gid: string) => gid.split("/").pop() ?? "";

export default function SetupPage() {
  const { shop, apiKey, themes } = useLoaderData<typeof loader>();
  const [themeId, setThemeId] = useState(themes?.[0] ? themeNumericId(themes[0].id) : "current");
  const selected = themes?.find((theme) => themeNumericId(theme.id) === themeId);
  const editorBase = `https://${shop}/admin/themes/${themeId}/editor`;
  const embedUrl = `${editorBase}?context=apps&activateAppId=${apiKey}/${EMBED_HANDLE}`;
  const themeLabel = selected ? `“${selected.name}”` : "your live theme";

  return (
    <s-page heading="Set up Leaf Popups" inlineSize="small">
      <s-section heading="1. Choose a theme">
        <s-stack direction="block" gap="base">
          {themes && themes.length > 0 ? (
            <s-select label="Theme" value={themeId} onChange={(event) => setThemeId((event.currentTarget as { value?: string }).value ?? "current")}>
              {themes.map((theme) => (
                <s-option key={theme.id} value={themeNumericId(theme.id)}>
                  {theme.name} ({ROLE_LABELS[theme.role] ?? theme.role})
                </s-option>
              ))}
            </s-select>
          ) : (
            <s-banner tone="info">
              We couldn’t list your themes, so the steps below use your live theme. You can switch themes from the
              theme editor’s top bar at any time.
            </s-banner>
          )}
          <s-paragraph>
            Leaf Popups works with every Shopify theme, including vintage themes, so the steps are the same whichever
            you pick. Turn the embed on once per theme. Repeat these steps if you switch to a new theme.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="2. Turn on the Leaf Popups app embed">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Open the theme editor for {themeLabel} with the app embed already switched on:
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" href={embedUrl} target="_blank">
              Open theme editor with Leaf Popups on
            </s-button>
          </s-stack>
          <s-ordered-list>
            <s-list-item>
              In the theme editor, open <s-text type="strong">App embeds</s-text> from the left toolbar (the icon with
              four squares).
            </s-list-item>
            <s-list-item>
              Find <s-text type="strong">Leaf Popups</s-text> and make sure its toggle is{" "}
              <s-text type="strong">on</s-text>. To stop popups on this theme, switch the toggle off.
            </s-list-item>
            <s-list-item>
              Click <s-text type="strong">Save</s-text> in the top right. The embed isn’t active on your storefront
              until you save.
            </s-list-item>
          </s-ordered-list>
          <s-image src={SCREENSHOT.src} alt={SCREENSHOT.alt} borderRadius="base" border="base" />
          <s-text color="subdued">
            The App embeds panel with Leaf Popups switched on. The preview shows a published popup. Click Save, top
            right, to make it live.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="3. Where popups appear">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Once the embed is on, popups can appear on every page of your online store:
          </s-paragraph>
          <s-unordered-list>
            {TEMPLATES.map((template) => (
              <s-list-item key={template}>{template}</s-list-item>
            ))}
          </s-unordered-list>
          <s-paragraph color="subdued">
            Popups don’t appear in checkout or on pages hosted by Shopify, such as the order status page. To limit a
            popup to certain pages, use its page rules, or exclude paths for all popups in Settings.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="4. Configure your popups">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            The embed has no settings of its own in the theme editor. Everything is configured here in the app:
          </s-paragraph>
          <s-unordered-list>
            <s-list-item>
              <s-link href="/app/popups">Popups</s-link>: design the content, then set the trigger, schedule, how
              often it shows, which pages it appears on, and which devices see it. Publish when you’re ready.
            </s-list-item>
            <s-list-item>
              <s-link href="/app/settings">Settings</s-link>: pause all popups, choose what happens when several
              popups match, exclude paths, and set default styles.
            </s-list-item>
          </s-unordered-list>
        </s-stack>
      </s-section>

      <s-section heading="Popups not showing?">
        <s-unordered-list>
          <s-list-item>Confirm the embed is on and saved in the theme your store is currently using.</s-list-item>
          <s-list-item>Check that the popup is published, not a draft, and that you’re on a page it targets.</s-list-item>
          <s-list-item>Make sure popups aren’t paused in Settings.</s-list-item>
          <s-list-item>
            Open your storefront in a private window. Popups with a frequency limit stay hidden after you’ve seen
            or closed them.
          </s-list-item>
          <s-list-item>
            Still stuck? <s-link href={embedUrl} target="_blank">Re-open the theme editor</s-link> and confirm the
            toggle is on.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
