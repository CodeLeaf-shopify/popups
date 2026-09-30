import { applyCommand } from "./commands";
import { syncDiscount, type Behavior, type Command, type EditorDocument, type PopupStatus } from "./types";

export type EditorMode = "edit" | "interact";
export type EditorDevice = "desktop" | "tablet" | "mobile";

export type EditorSnapshot = {
  document: EditorDocument;
  behavior: Behavior;
};

export type EditorSession = {
  selectedId: string | null;
  mode: EditorMode;
  device: EditorDevice;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  coalesceKey: string | null;
  coalesceAt: number;
  commandError: string | null;
};

export type EditorMeta = {
  id: string;
  name: string;
  status: PopupStatus;
  shop: string;
};

export type EditorState = {
  document: EditorDocument;
  behavior: Behavior;
  session: EditorSession;
  meta: EditorMeta;
};

export type EditorAction =
  | { type: "command"; command: Command; coalesceKey?: string }
  | { type: "behavior"; behavior: Behavior; coalesceKey?: string }
  | { type: "replaceBehavior"; behavior: Behavior }
  | { type: "rename"; name: string }
  | { type: "select"; id: string | null }
  | { type: "mode"; mode: EditorMode }
  | { type: "device"; device: EditorDevice }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "status"; status: PopupStatus };

const HISTORY_LIMIT = 50;
const COALESCE_MS = 600;

function snapshot(state: EditorState): EditorSnapshot {
  return {
    document: structuredClone(state.document),
    behavior: structuredClone(state.behavior),
  };
}

function pushPast(state: EditorState, coalesceKey?: string): EditorSession {
  const now = Date.now();
  if (
    coalesceKey &&
    state.session.coalesceKey === coalesceKey &&
    now - state.session.coalesceAt < COALESCE_MS
  ) {
    return { ...state.session, coalesceAt: now, commandError: null };
  }
  const past = [...state.session.past, snapshot(state)].slice(-HISTORY_LIMIT);
  return {
    ...state.session,
    past,
    future: [],
    coalesceKey: coalesceKey ?? null,
    coalesceAt: now,
    commandError: null,
  };
}

export function createEditorState(input: {
  document: EditorDocument;
  behavior: Behavior;
  meta: EditorMeta;
}): EditorState {
  return {
    document: input.document,
    behavior: input.behavior,
    meta: input.meta,
    session: {
      selectedId: input.document.rootId,
      mode: "edit",
      device: "desktop",
      past: [],
      future: [],
      coalesceKey: null,
      coalesceAt: 0,
      commandError: null,
    },
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "command": {
      const result = applyCommand(state.document, action.command);
      if (result.error || result.document === state.document) {
        return {
          ...state,
          session: { ...state.session, commandError: result.error ?? null },
        };
      }
      const selectedStillExists =
        state.session.selectedId && result.document.nodes[state.session.selectedId]
          ? state.session.selectedId
          : result.document.rootId;
      return {
        ...state,
        document: result.document,
        behavior: syncDiscount(result.document, state.behavior),
        session: {
          ...pushPast(state, action.coalesceKey),
          selectedId: result.insertedId ?? selectedStillExists,
        },
      };
    }
    case "replaceBehavior":
      return { ...state, behavior: action.behavior };
    case "behavior":
      return {
        ...state,
        behavior: action.behavior,
        session: pushPast(state, action.coalesceKey),
      };
    case "rename":
      return { ...state, meta: { ...state.meta, name: action.name } };
    case "select":
      return { ...state, session: { ...state.session, selectedId: action.id, commandError: null } };
    case "mode":
      return { ...state, session: { ...state.session, mode: action.mode } };
    case "device":
      return { ...state, session: { ...state.session, device: action.device } };
    case "undo": {
      const previous = state.session.past[state.session.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        document: previous.document,
        behavior: previous.behavior,
        session: {
          ...state.session,
          past: state.session.past.slice(0, -1),
          future: [snapshot(state), ...state.session.future].slice(0, HISTORY_LIMIT),
          coalesceKey: null,
          commandError: null,
          selectedId:
            state.session.selectedId && previous.document.nodes[state.session.selectedId]
              ? state.session.selectedId
              : previous.document.rootId,
        },
      };
    }
    case "redo": {
      const next = state.session.future[0];
      if (!next) return state;
      return {
        ...state,
        document: next.document,
        behavior: next.behavior,
        session: {
          ...state.session,
          past: [...state.session.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: state.session.future.slice(1),
          coalesceKey: null,
          commandError: null,
        },
      };
    }
    case "status":
      return { ...state, meta: { ...state.meta, status: action.status } };
    default:
      return state;
  }
}
