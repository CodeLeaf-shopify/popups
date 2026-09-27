import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { compile } from "../popup/compile";
import { createEditorState, editorReducer } from "../popup/editor-state";
import type { Behavior, Command, EditorDocument, PopupStatus } from "../popup/types";
import { PropertyPanel } from "./PropertyPanel";

type SaveResponse = {
  ok: boolean;
  intent: string;
  error?: string;
  updatedAt?: string;
  clientKey?: string;
  status?: PopupStatus;
  token?: string;
  shop?: string;
};

type PopupEditorProps = {
  rendererSource: string;
  initialDocument: EditorDocument;
  initialBehavior: Behavior;
  meta: {
    id: string;
    name: string;
    kind: string;
    status: PopupStatus;
    shop: string;
  };
  updatedAt: string;
};

function draftKey(name: string, document: EditorDocument, behavior: Behavior): string {
  return JSON.stringify({ name, document, behavior });
}

export function PopupEditor({
  rendererSource,
  initialDocument,
  initialBehavior,
  meta,
  updatedAt,
}: PopupEditorProps) {
  const [editor, dispatch] = useReducer(
    editorReducer,
    { document: initialDocument, behavior: initialBehavior, meta },
    (initial) => createEditorState(initial),
  );
  const saveFetcher = useFetcher<SaveResponse>();
  const actionFetcher = useFetcher<SaveResponse>();
  const saveFetcherRef = useRef(saveFetcher);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [savedKey, setSavedKey] = useState(() => draftKey(meta.name, initialDocument, initialBehavior));
  const [conflict, setConflict] = useState<string | null>(null);
  const [seenSave, setSeenSave] = useState(saveFetcher.data);
  const [seenAction, setSeenAction] = useState(actionFetcher.data);
  const key = draftKey(editor.meta.name, editor.document, editor.behavior);
  const compiled = useMemo(
    () => compile(editor.document, editor.behavior),
    [editor.document, editor.behavior],
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

  if (actionFetcher.data !== seenAction) {
    setSeenAction(actionFetcher.data);
    const data = actionFetcher.data;
    if (data?.ok && data.updatedAt) setSavedAt(data.updatedAt);
    if (data?.ok && data.clientKey) setSavedKey(data.clientKey);
    if (data?.ok && data.status) dispatch({ type: "status", status: data.status });
    if (data && !data.ok && data.error) setConflict(data.error);
    if (data?.ok && data.intent !== "preview-link") setConflict(null);
  }

  useEffect(() => {
    saveFetcherRef.current = saveFetcher;
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

  useEffect(() => {
    if (key === savedKey || actionFetcher.state !== "idle") return;
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
  }, [key, savedKey, savedAt, actionFetcher.state]);

  const previewUrl =
    actionFetcher.data?.intent === "preview-link" && actionFetcher.data.token && actionFetcher.data.shop
      ? `https://${actionFetcher.data.shop}/?leaf_preview=${encodeURIComponent(actionFetcher.data.token)}`
      : null;
  const saving = saveFetcher.state !== "idle";
  const statusLabel =
    editor.meta.status === "published" ? "Published" : editor.meta.status === "paused" ? "Paused" : "Draft";

  return (
    <s-page heading={editor.meta.name || "Popup"}>
      <s-button
        slot="primary-action"
        variant="primary"
        {...(actionFetcher.state !== "idle" ? { loading: true } : {})}
        onClick={() =>
          submit(actionFetcher, {
            intent: "publish",
            name: editor.meta.name,
            document: editor.document,
            behavior: editor.behavior,
            updatedAt: savedAt,
            clientKey: key,
          })
        }
      >
        Publish
      </s-button>
      <s-stack direction="block" gap="base">
        {conflict ? <s-banner tone="critical">{conflict}</s-banner> : null}
        {!compiled.ok ? <s-banner tone="warning">{compiled.error}</s-banner> : null}
        <s-stack direction="inline" gap="base">
          <s-badge
            tone={editor.meta.status === "published" ? "success" : editor.meta.status === "paused" ? "warning" : "info"}
          >
            {statusLabel}
          </s-badge>
          <s-text>{saving ? "Saving…" : key === savedKey ? "Saved" : "Unsaved changes"}</s-text>
        </s-stack>
        <s-text-field
          label="Name"
          value={editor.meta.name}
          onInput={(event) => {
            const target = event.currentTarget as { value?: string };
            dispatch({ type: "rename", name: target.value ?? "" });
          }}
        />
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={() => dispatch({ type: "undo" })}
            {...(editor.session.past.length === 0 ? { disabled: true } : {})}
          >
            Undo
          </s-button>
          <s-button
            onClick={() => dispatch({ type: "redo" })}
            {...(editor.session.future.length === 0 ? { disabled: true } : {})}
          >
            Redo
          </s-button>
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
          <s-button
            variant={editor.session.device === "desktop" ? "primary" : "secondary"}
            onClick={() => dispatch({ type: "device", device: "desktop" })}
          >
            Desktop
          </s-button>
          <s-button
            variant={editor.session.device === "mobile" ? "primary" : "secondary"}
            onClick={() => dispatch({ type: "device", device: "mobile" })}
          >
            Mobile
          </s-button>
          <s-button onClick={() => submit(actionFetcher, { intent: "preview-link" })}>
            Storefront preview link
          </s-button>
          {editor.meta.status === "published" ? (
            <s-button onClick={() => submit(actionFetcher, { intent: "pause", updatedAt: savedAt })}>
              Pause
            </s-button>
          ) : null}
          {editor.meta.status !== "draft" ? (
            <s-button onClick={() => submit(actionFetcher, { intent: "unpublish", updatedAt: savedAt })}>
              Unpublish
            </s-button>
          ) : null}
        </s-stack>
        {previewUrl ? (
          <s-link href={previewUrl} target="_blank">
            Open this draft on your theme
          </s-link>
        ) : null}
        <s-grid gridTemplateColumns="minmax(0, 1fr) 320px" gap="base">
          <s-box background="subdued" padding="base" borderRadius="base">
            <iframe
              title="Popup preview"
              ref={frameRef}
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              onLoad={() => postPreview()}
              style={{
                width: editor.session.device === "mobile" ? 390 : "100%",
                height: 680,
                border: 0,
                background: "#ececec",
              }}
            />
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <PropertyPanel
              document={editor.document}
              behavior={editor.behavior}
              selectedId={editor.session.selectedId}
              commandError={editor.session.commandError}
              onCommand={(command, coalesceKey) => dispatch({ type: "command", command, coalesceKey })}
              onBehavior={(behavior, coalesceKey) => dispatch({ type: "behavior", behavior, coalesceKey })}
            />
          </s-box>
        </s-grid>
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
