import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { ColorTokenField, NumberInput } from "../components/PropertyPanel";
import { isConflictMode, parsePathList, parseTokens } from "../popup/parse";
import { republishAll, syncManifest } from "../popup/publish.server";
import { getShopSettings, saveShopSettings } from "../popup/settings.server";
import { stableStringify } from "../popup/stable-stringify";
import { EMBED_HANDLE, type ConflictMode, type ShopSettings, type Tokens } from "../popup/types";
import { authenticate } from "../shopify.server";

type SettingsResponse = { ok: true; settings: ShopSettings; warning?: string } | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    settings: await getShopSettings(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<SettingsResponse> => {
  const { session, admin } = await authenticate.admin(request);
  const body = (await request.json().catch(() => null)) as Partial<Record<keyof ShopSettings, unknown>> | null;
  if (!body) return { ok: false, error: "The settings could not be read." };
  if (!isConflictMode(body.conflictMode)) return { ok: false, error: "Choose how overlapping popups behave." };
  const exclude = parsePathList(body.exclude);
  if (exclude.some((path) => !path.startsWith("/"))) {
    return { ok: false, error: "Excluded paths must start with “/”, for example /cart." };
  }

  const previous = await getShopSettings(session.shop);
  const saved = await saveShopSettings(session.shop, {
    conflictMode: body.conflictMode,
    paused: body.paused === true,
    tokens: parseTokens(body.tokens),
    exclude,
    hideForSubscribed: body.hideForSubscribed === true,
    hideForLoggedIn: body.hideForLoggedIn === true,
  });

  const stylesChanged = stableStringify(previous.tokens) !== stableStringify(saved.tokens);
  const synced = stylesChanged
    ? await republishAll(admin, session.shop)
    : await syncManifest(admin, session.shop);
  if (!synced.ok) return { ok: true, settings: saved, warning: synced.error };
  return { ok: true, settings: saved };
};

const CONFLICT_MODES: { value: ConflictMode; label: string; detail: string }[] = [
  {
    value: "queue",
    label: "One at a time, by priority",
    detail:
      "One modal, one top bar, and one bottom bar can show together. Popups competing for the same spot wait their turn, highest priority first.",
  },
  {
    value: "all",
    label: "Show all",
    detail: "Every matching popup shows as soon as its trigger fires, even if that stacks popups on top of each other.",
  },
  {
    value: "single",
    label: "Highest priority only",
    detail: "Only the highest-priority matching popup shows on each page view. The others are skipped.",
  },
];

export default function SettingsPage() {
  const { shop, apiKey, settings: initial } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [settings, setSettings] = useState<ShopSettings>(initial);
  const [excludeText, setExcludeText] = useState(initial.exclude.join("\n"));
  const embedUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${EMBED_HANDLE}`;
  const saving = fetcher.state !== "idle";
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const selectedMode = CONFLICT_MODES.find((mode) => mode.value === settings.conflictMode) ?? CONFLICT_MODES[0];

  const update = (patch: Partial<ShopSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const updateTokens = (patch: Partial<Tokens>) =>
    setSettings((current) => ({ ...current, tokens: { ...current.tokens, ...patch } }));
  const checked = (event: Event) => (event.currentTarget as { checked?: boolean }).checked === true;

  function save() {
    const exclude = excludeText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    fetcher.submit(JSON.stringify({ ...settings, exclude }), {
      method: "POST",
      encType: "application/json",
    });
  }

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" variant="primary" onClick={save} {...(saving ? { loading: true } : {})}>
        Save
      </s-button>
      <s-stack direction="block" gap="base">
        {result && !result.ok ? <s-banner tone="critical">{result.error}</s-banner> : null}
        {result?.ok && result.warning ? (
          <s-banner tone="warning" heading="Settings saved, but the storefront needs attention">
            {result.warning}
          </s-banner>
        ) : null}
        {result?.ok && !result.warning ? <s-banner tone="success">Settings saved.</s-banner> : null}

        <s-section heading="Storefront">
          <s-stack direction="block" gap="base">
            <s-switch
              label="Pause all popups"
              details="Published popups stay published but stop showing on your storefront until you turn this off."
              {...(settings.paused ? { checked: true } : {})}
              onChange={(event) => update({ paused: checked(event) })}
            />
            <s-stack direction="block" gap="small-200">
              <s-heading>Theme embed</s-heading>
              <s-paragraph>
                Popups render through one theme app embed. Turn it on once, then every published popup uses it.
              </s-paragraph>
              <s-link href={embedUrl} target="_blank">
                Enable Leaf Popups in the theme editor
              </s-link>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Popup conflicts">
          <s-stack direction="block" gap="base">
            <s-choice-list
              label="When more than one popup matches a page"
              onChange={(event) => {
                const [value] = (event.currentTarget as { values?: string[] }).values ?? [];
                if (isConflictMode(value)) update({ conflictMode: value });
              }}
            >
              {CONFLICT_MODES.map((mode) => (
                <s-choice
                  key={mode.value}
                  value={mode.value}
                  {...(mode.value === settings.conflictMode ? { selected: true } : {})}
                >
                  {mode.label}
                </s-choice>
              ))}
            </s-choice-list>
            <s-text color="subdued">{selectedMode.detail}</s-text>
          </s-stack>
        </s-section>

        <s-section heading="Default styles">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Every popup uses these styles unless it sets its own in the editor. Saving new styles updates
              your published popups.
            </s-paragraph>
            <ColorTokenField
              id="settings-background-color"
              label="Background"
              value={settings.tokens.background}
              onValue={(background) => updateTokens({ background })}
            />
            <ColorTokenField
              id="settings-text-color"
              label="Text"
              value={settings.tokens.text}
              onValue={(text) => updateTokens({ text })}
            />
            <ColorTokenField
              id="settings-accent-color"
              label="Accent"
              value={settings.tokens.accent}
              onValue={(accent) => updateTokens({ accent })}
            />
            <ColorTokenField
              id="settings-overlay-color"
              label="Overlay"
              alpha
              value={settings.tokens.overlay}
              onValue={(overlay) => updateTokens({ overlay })}
            />
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <NumberInput
                label="Modal width"
                value={settings.tokens.width}
                min={240}
                max={960}
                step={10}
                suffix="px"
                onValue={(width) => updateTokens({ width })}
              />
              <NumberInput
                label="Corner radius"
                value={settings.tokens.radius}
                min={0}
                max={48}
                suffix="px"
                onValue={(radius) => updateTokens({ radius })}
              />
            </s-grid>
            <s-text-field
              label="Font"
              value={settings.tokens.font}
              onInput={(event) => updateTokens({ font: (event.currentTarget as { value?: string }).value ?? "" })}
            />
          </s-stack>
        </s-section>

        <s-section heading="Where popups never show">
          <s-text-area
            label="Excluded paths"
            details="One path per line. Any page starting with one of these paths never shows a popup, for example /cart or /account."
            rows={4}
            value={excludeText}
            onInput={(event) => setExcludeText((event.currentTarget as { value?: string }).value ?? "")}
          />
        </s-section>

        <s-section heading="Audience">
          <s-stack direction="block" gap="base">
            <s-checkbox
              label="Hide from subscribed customers"
              details="Skips popups for visitors who already signed up through a popup or accept email marketing."
              {...(settings.hideForSubscribed ? { checked: true } : {})}
              onChange={(event) => update({ hideForSubscribed: checked(event) })}
            />
            <s-checkbox
              label="Hide from logged-in customers"
              details="Applies to every popup. Individual popups can also hide from logged-in customers in the editor."
              {...(settings.hideForLoggedIn ? { checked: true } : {})}
              onChange={(event) => update({ hideForLoggedIn: checked(event) })}
            />
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
