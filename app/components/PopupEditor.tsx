import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { compile } from "../popup/compile";
import { createEditorState, editorReducer, type EditorDevice } from "../popup/editor-state";
import { stableStringify } from "../popup/stable-stringify";
import type { Behavior, Command, EditorDocument, PopupStatus, StorefrontPayload, Tokens } from "../popup/types";
import { DesignPanel, PopupSettingsPanel, StructurePanel } from "./PropertyPanel";

type PreviewLink = { url: string; expiresAt: number };

type SaveResponse = {
  ok: boolean;
  intent: string;
  error?: string;
  updatedAt?: string;
  clientKey?: string;
  status?: PopupStatus;
  preview?: PreviewLink;
  payload?: StorefrontPayload;
  behavior?: Behavior;
};

type PopupEditorProps = {
  rendererSource: string;
  initialDocument: EditorDocument;
  initialBehavior: Behavior;
  meta: {
    id: string;
    name: string;
    status: PopupStatus;
    shop: string;
  };
  updatedAt: string;
  publishedPayload: StorefrontPayload | null;
  preview: PreviewLink;
  globalTokens: Tokens;
  hiddenForLoggedInGlobally: boolean;
  pro: boolean;
};

const DEVICE_WIDTHS: Record<EditorDevice, number | string> = {
  desktop: "100%",
  tablet: 820,
  mobile: 390,
};

const PREVIEW_REFRESH_MARGIN_MS = 60_000;

function draftKey(name: string, document: EditorDocument, behavior: Behavior): string {
  return JSON.stringify({ name, document, behavior });
}

export function PopupEditor({
  rendererSource,
  initialDocument,
  initialBehavior,
  meta,
  updatedAt,
  publishedPayload: initialPublishedPayload,
  preview: initialPreview,
  globalTokens,
  hiddenForLoggedInGlobally,
  pro,
}: PopupEditorProps) {
  const [editor, dispatch] = useReducer(
    editorReducer,
    { document: initialDocument, behavior: initialBehavior, meta },
    (initial) => createEditorState(initial),
  );
  const saveFetcher = useFetcher<SaveResponse>();
  const publishFetcher = useFetcher<SaveResponse>();
  const statusFetcher = useFetcher<SaveResponse>();
  const previewFetcher = useFetcher<SaveResponse>();
  const saveFetcherRef = useRef(saveFetcher);
  const previewFetcherRef = useRef(previewFetcher);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [publishedDraft, setPublishedDraft] = useState<{
    name: string;
    document: EditorDocument;
    behavior: Behavior;
  } | null>(null);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [savedKey, setSavedKey] = useState(() => draftKey(meta.name, initialDocument, initialBehavior));
  const [conflict, setConflict] = useState<string | null>(null);
  const [publishedPayload, setPublishedPayload] = useState(initialPublishedPayload);
  const [preview, setPreview] = useState(initialPreview);
  const [seenSave, setSeenSave] = useState(saveFetcher.data);
  const [seenPublish, setSeenPublish] = useState(publishFetcher.data);
  const [seenStatus, setSeenStatus] = useState(statusFetcher.data);
  const [seenPreview, setSeenPreview] = useState(previewFetcher.data);
  const key = draftKey(editor.meta.name, editor.document, editor.behavior);
  const compiled = useMemo(
    () => compile(editor.document, editor.behavior, globalTokens),
    [editor.document, editor.behavior, globalTokens],
  );
  const previewRef = useRef({
    payload: compiled.ok ? compiled.payload : null,
    mode: editor.session.mode,
    selectedId: editor.session.selectedId,
  });
  const draftRef = useRef({
    name: editor.meta.name,
    document: editor.document,
    behavior: editor.behavior,
    key: draftKey(editor.meta.name, editor.document, editor.behavior),
  });

  const srcDoc = useMemo(() => previewDocument(rendererSource), [rendererSource]);

  function postPreview() {
    frameRef.current?.contentWindow?.postMessage(
      { source: "leaf-popups-admin", ...previewRef.current },
      "*",
    );
  }

  if (saveFetcher.data !== seenSave) {
    setSeenSave(saveFetcher.data);
    const data = saveFetcher.data;
    if (data?.intent === "save" && data.ok && data.updatedAt && data.clientKey) {
      setSavedAt(data.updatedAt);
      setSavedKey(data.clientKey);
      setConflict(null);
    } else if (data?.error) {
      setConflict(data.error);
    }
  }

  if (publishFetcher.data !== seenPublish) {
    setSeenPublish(publishFetcher.data);
    const data = publishFetcher.data;
    const submitted = publishedDraft;
    if (data?.ok) {
      if (data.updatedAt) setSavedAt(data.updatedAt);
      if (data.status) dispatch({ type: "status", status: data.status });
      if (data.payload) setPublishedPayload(data.payload);
      const serverBehavior = data.behavior;
      if (serverBehavior && submitted) {
        if (stableStringify(editor.behavior) === stableStringify(submitted.behavior)) {
          dispatch({ type: "replaceBehavior", behavior: serverBehavior });
        } else if (
          editor.behavior.discount &&
          serverBehavior.discount &&
          editor.behavior.discount.mode === serverBehavior.discount.mode &&
          (!editor.behavior.discount.code || editor.behavior.discount.code === serverBehavior.discount.code)
        ) {
          dispatch({
            type: "replaceBehavior",
            behavior: {
              ...editor.behavior,
              discount: {
                ...editor.behavior.discount,
                code: serverBehavior.discount.code,
                shopifyDiscountId: serverBehavior.discount.shopifyDiscountId,
              },
            },
          });
        }
        setSavedKey(draftKey(submitted.name, submitted.document, serverBehavior));
      }
      setConflict(null);
    } else if (data?.error) {
      setConflict(data.error);
    }
  }

  if (statusFetcher.data !== seenStatus) {
    setSeenStatus(statusFetcher.data);
    const data = statusFetcher.data;
    if (data?.ok) {
      if (data.updatedAt) setSavedAt(data.updatedAt);
      if (data.status) dispatch({ type: "status", status: data.status });
      if (data.status !== "published") setPublishedPayload(null);
      setConflict(null);
    } else if (data?.error) {
      setConflict(data.error);
    }
  }

  if (previewFetcher.data !== seenPreview) {
    setSeenPreview(previewFetcher.data);
    if (previewFetcher.data?.ok && previewFetcher.data.preview) setPreview(previewFetcher.data.preview);
  }

  useEffect(() => {
    saveFetcherRef.current = saveFetcher;
    previewFetcherRef.current = previewFetcher;
    previewRef.current = {
      payload: compiled.ok ? compiled.payload : null,
      mode: editor.session.mode,
      selectedId: editor.session.selectedId,
    };
    draftRef.current = {
      name: editor.meta.name,
      document: editor.document,
      behavior: editor.behavior,
      key,
    };
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        id?: string | null;
        command?: Command;
      };
      if (!data || data.source !== "leaf-popups-preview") return;
      if (data.type === "ready") postPreview();
      if (data.type === "select") dispatch({ type: "select", id: data.id ?? null });
      if (data.type === "command" && data.command) dispatch({ type: "command", command: data.command });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    postPreview();
  }, [compiled, editor.session.mode, editor.session.selectedId]);

  const busy = publishFetcher.state !== "idle" || statusFetcher.state !== "idle";

  useEffect(() => {
    if (key === savedKey || busy) return;
    const timer = window.setTimeout(() => {
      const draft = draftRef.current;
      submit(saveFetcherRef.current, {
        intent: "save",
        name: draft.name,
        document: draft.document,
        behavior: draft.behavior,
        updatedAt: savedAt,
        clientKey: draft.key,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [key, savedKey, savedAt, busy]);

  useEffect(() => {
    const refresh = () => submit(previewFetcherRef.current, { intent: "preview-link" });
    const delay = preview.expiresAt - PREVIEW_REFRESH_MARGIN_MS - Date.now();
    if (delay <= 0) {
      refresh();
      return;
    }
    const timer = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(timer);
  }, [preview.expiresAt]);

  const saving = saveFetcher.state !== "idle";
  const unsaved = key !== savedKey;
  const published = editor.meta.status === "published";
  const archived = editor.meta.status === "archived";
  const hasChanges =
    !published ||
    !publishedPayload ||
    !compiled.ok ||
    stableStringify(compiled.payload) !== stableStringify(publishedPayload);

  function publish() {
    setPublishedDraft({
      name: editor.meta.name,
      document: editor.document,
      behavior: editor.behavior,
    });
    submit(publishFetcher, {
      intent: "publish",
      name: editor.meta.name,
      document: editor.document,
      behavior: editor.behavior,
      updatedAt: savedAt,
      clientKey: key,
    });
  }

  function unpublish() {
    submit(statusFetcher, { intent: "unpublish", updatedAt: savedAt });
  }

  const unpublishLoading = statusFetcher.state !== "idle" ? { loading: true } : {};
  const primaryAction =
    published && !hasChanges ? (
      <s-button slot="primary-action" variant="primary" {...unpublishLoading} onClick={unpublish}>
        Unpublish
      </s-button>
    ) : (
      <s-button
        slot="primary-action"
        variant="primary"
        {...(publishFetcher.state !== "idle" ? { loading: true } : {})}
        {...(!compiled.ok || statusFetcher.state !== "idle" ? { disabled: true } : {})}
        onClick={publish}
      >
        {published ? "Publish changes" : "Publish"}
      </s-button>
    );

  return (
    <s-page heading={editor.meta.name || "Popup"} inlineSize="large">
      {primaryAction}
      {published && hasChanges ? (
        <s-button
          slot="secondary-actions"
          {...unpublishLoading}
          {...(publishFetcher.state !== "idle" ? { disabled: true } : {})}
          onClick={unpublish}
        >
          Unpublish
        </s-button>
      ) : null}
      <s-button
        slot="secondary-actions"
        icon="view"
        href={preview.url}
        target="_blank"
        {...(unsaved || saving ? { disabled: true } : {})}
      >
        Preview
      </s-button>
      <s-button
        slot="secondary-actions"
        icon="undo"
        accessibilityLabel="Undo"
        onClick={() => dispatch({ type: "undo" })}
        {...(editor.session.past.length === 0 ? { disabled: true } : {})}
      />
      <s-button
        slot="secondary-actions"
        icon="redo"
        accessibilityLabel="Redo"
        onClick={() => dispatch({ type: "redo" })}
        {...(editor.session.future.length === 0 ? { disabled: true } : {})}
      />
      <s-stack direction="block" gap="base">
        {conflict ? <s-banner tone="critical">{conflict}</s-banner> : null}
        {!compiled.ok ? <s-banner tone="warning">{compiled.error}</s-banner> : null}
        <s-query-container>
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="minmax(0, 1fr) 360px" gap="base">
            <s-section>
              <s-stack direction="block" gap="base">
                <s-grid gridTemplateColumns="@container (inline-size > 560px) minmax(0, 1fr) auto, minmax(0, 1fr)" gap="base" alignItems="end">
                  <s-text-field
                    label="Name"
                    value={editor.meta.name}
                    onInput={(event) => {
                      const target = event.currentTarget as { value?: string };
                      dispatch({ type: "rename", name: target.value ?? "" });
                    }}
                  />
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-badge tone={published ? "success" : archived ? "warning" : "info"}>
                      {published ? "Published" : archived ? "Archived" : "Draft"}
                    </s-badge>
                    {published && hasChanges ? <s-badge tone="warning">Unpublished changes</s-badge> : null}
                    <s-text color="subdued">{saving ? "Saving…" : unsaved ? "Unsaved changes" : "Saved"}</s-text>
                  </s-stack>
                </s-grid>
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-button-group gap="none" accessibilityLabel="Preview mode">
                    <s-button
                      variant={editor.session.mode === "edit" ? "primary" : "secondary"}
                      onClick={() => dispatch({ type: "mode", mode: "edit" })}
                    >
                      Edit
                    </s-button>
                    <s-button
                      variant={editor.session.mode === "interact" ? "primary" : "secondary"}
                      onClick={() => dispatch({ type: "mode", mode: "interact" })}
                    >
                      Interact
                    </s-button>
                  </s-button-group>
                  <s-button-group gap="none" accessibilityLabel="Preview device">
                    {(["desktop", "tablet", "mobile"] as const).map((device) => (
                      <s-button
                        key={device}
                        icon={device}
                        accessibilityLabel={device.charAt(0).toUpperCase() + device.slice(1)}
                        variant={editor.session.device === device ? "primary" : "secondary"}
                        onClick={() => dispatch({ type: "device", device })}
                      />
                    ))}
                  </s-button-group>
                </s-stack>
                <s-box background="subdued" padding="base" borderRadius="base">
                  <iframe
                    title="Popup preview"
                    ref={frameRef}
                    sandbox="allow-scripts"
                    srcDoc={srcDoc}
                    onLoad={() => postPreview()}
                    style={{
                      display: "block",
                      margin: "0 auto",
                      width: DEVICE_WIDTHS[editor.session.device],
                      maxWidth: "100%",
                      height: "min(720px, 75vh)",
                      border: 0,
                      background: "#ececec",
                    }}
                  />
                </s-box>
              </s-stack>
            </s-section>
            <StructurePanel
              document={editor.document}
              selectedId={editor.session.selectedId}
              commandError={editor.session.commandError}
              onCommand={(command, coalesceKey) => dispatch({ type: "command", command, coalesceKey })}
              onSelect={(id) => dispatch({ type: "select", id })}
            />
            </s-grid>
            <s-grid
              gridTemplateColumns="@container (inline-size > 860px) minmax(0, 1fr) minmax(0, 1fr), minmax(0, 1fr)"
              gap="base"
            >
              <PopupSettingsPanel
                behavior={editor.behavior}
                pro={pro}
                hiddenForLoggedInGlobally={hiddenForLoggedInGlobally}
                onBehavior={(behavior, coalesceKey) => dispatch({ type: "behavior", behavior, coalesceKey })}
              />
              <DesignPanel
                document={editor.document}
                behavior={editor.behavior}
                globalTokens={globalTokens}
                onCommand={(command, coalesceKey) => dispatch({ type: "command", command, coalesceKey })}
              />
            </s-grid>
          </s-stack>
        </s-query-container>
      </s-stack>
    </s-page>
  );
}

function submit(fetcher: ReturnType<typeof useFetcher<SaveResponse>>, body: Record<string, unknown>) {
  fetcher.submit(JSON.stringify(body), { method: "POST", encType: "application/json" });
}

function previewDocument(rendererSource: string): string {
  const script = rendererSource.replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script>${script}</script><script>
    var latest = null;
    var api = null;
    function options() {
      return {
        mode: latest.mode,
        selectedId: latest.selectedId,
        onSelect: function (id) { parent.postMessage({ source: "leaf-popups-preview", type: "select", id: id }, "*"); },
        onCommand: function (command) { parent.postMessage({ source: "leaf-popups-preview", type: "command", command: command }, "*"); },
        onSubmit: function () { return Promise.resolve({ ok: true, message: "Preview only. No customer was created." }); }
      };
    }
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.source !== "leaf-popups-admin") return;
      latest = data;
      if (!data.payload) return;
      if (!api) api = window.LeafPopups.mount(document.getElementById("root"), data.payload, options());
      else api.update(data.payload, options());
    });
    parent.postMessage({ source: "leaf-popups-preview", type: "ready" }, "*");
  </script></body></html>`;
}
