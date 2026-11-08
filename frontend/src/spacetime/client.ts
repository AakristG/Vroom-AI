/**
 * Frontend connection to SpacetimeDB, the live layer for the whole site: call transcripts and voice
 * captions, AI next moves, the assistant chat history, the agent's What-if dashboard commands, and
 * the Compare page selection and AI suggestions.
 *
 * Uses the official TypeScript SDK (`spacetimedb` on npm) with bindings generated from
 * spacetimedb/server/src/index.ts (`npm run generate:bindings`). One connection is shared by the
 * whole app; components read rows through the hooks below and re-render on every insert/update.
 *
 * Docs: https://spacetimedb.com/docs/clients/typescript
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { DbConnection } from "./module_bindings";

const SPACETIMEDB_URL = import.meta.env.VITE_SPACETIMEDB_URL ?? "http://127.0.0.1:3000";
const SPACETIMEDB_MODULE_NAME = import.meta.env.VITE_SPACETIMEDB_MODULE_NAME ?? "toyota-nextmove";

export type CallMessage = { id: bigint; callId: string; role: string; content: string; createdAt: string };
export type CallSession = { callId: string; agentId: string; status: string; lastSpeaker: string; updatedAt: string };
export type CallOwner = { callId: string; customerId: string; channel: string; fromNumber: string; startedAt: string };
export type NextMoveRow = {
  id: bigint;
  customerId: string;
  stepKey: string;
  position: number;
  title: string;
  detail: string;
  status: string;
  actionLabel: string;
  actionJson: string;
  updatedAt: string;
};

export type AssistantTurnRow = {
  id: bigint;
  customerId: string;
  turnId: string;
  role: string;
  content: string;
  toolsJson: string;
  actionsJson: string;
  offline: boolean;
  createdAt: string;
};
export type DashboardStateRow = { customerId: string; simulatorJson: string; scenarioJson: string; source: string; revision: bigint; updatedAt: string };
export type CompareSelectionRow = { customerId: string; idsJson: string; updatedAt: string };
export type CompareSuggestionRow = { customerId: string; selectionKey: string; suggestionsJson: string; source: string; updatedAt: string };
export type VoiceCaptionRow = { callId: string; customerId: string; status: string; turnsJson: string; sequence: bigint; updatedAt: string };

type Snapshot = {
  status: "connecting" | "live" | "offline";
  messages: CallMessage[];
  sessions: CallSession[];
  owners: CallOwner[];
  nextMoves: NextMoveRow[];
  assistantTurns: AssistantTurnRow[];
  dashboards: DashboardStateRow[];
  compareSelections: CompareSelectionRow[];
  compareSuggestions: CompareSuggestionRow[];
  voiceCaptions: VoiceCaptionRow[];
};

let snapshot: Snapshot = {
  status: "connecting",
  messages: [],
  sessions: [],
  owners: [],
  nextMoves: [],
  assistantTurns: [],
  dashboards: [],
  compareSelections: [],
  compareSuggestions: [],
  voiceCaptions: [],
};
const listeners = new Set<() => void>();
let connection: DbConnection | null = null;

function emit(conn: DbConnection) {
  snapshot = {
    status: "live",
    messages: [...conn.db.callMessage.iter()] as CallMessage[],
    sessions: [...conn.db.callSession.iter()] as CallSession[],
    owners: [...conn.db.callOwner.iter()] as CallOwner[],
    nextMoves: [...conn.db.nextMove.iter()] as NextMoveRow[],
    assistantTurns: [...conn.db.assistantTurn.iter()] as AssistantTurnRow[],
    dashboards: [...conn.db.dashboardState.iter()] as DashboardStateRow[],
    compareSelections: [...conn.db.compareSelection.iter()] as CompareSelectionRow[],
    compareSuggestions: [...conn.db.compareSuggestion.iter()] as CompareSuggestionRow[],
    voiceCaptions: [...conn.db.voiceCaption.iter()] as VoiceCaptionRow[],
  };
  listeners.forEach((l) => l());
}

function setOffline() {
  snapshot = { ...snapshot, status: "offline" };
  listeners.forEach((l) => l());
}

/** Connect once and subscribe to every table the site renders. Safe to call repeatedly. */
export function connectToSpacetimeDB(): DbConnection | null {
  if (connection) return connection;
  try {
    connection = DbConnection.builder()
      .withUri(SPACETIMEDB_URL)
      .withDatabaseName(SPACETIMEDB_MODULE_NAME)
      .onConnect((conn) => {
        const refresh = () => emit(conn);
        const tables = [
          conn.db.callMessage,
          conn.db.callSession,
          conn.db.callOwner,
          conn.db.nextMove,
          conn.db.assistantTurn,
          conn.db.dashboardState,
          conn.db.compareSelection,
          conn.db.compareSuggestion,
          conn.db.voiceCaption,
        ] as any[];
        for (const table of tables) {
          table.onInsert?.(refresh);
          table.onDelete?.(refresh);
          table.onUpdate?.(refresh);
        }
        conn
          .subscriptionBuilder()
          .onApplied(refresh)
          .subscribe([
            "SELECT * FROM call_session",
            "SELECT * FROM call_message",
            "SELECT * FROM call_owner",
            "SELECT * FROM next_move",
            "SELECT * FROM assistant_turn",
            "SELECT * FROM dashboard_state",
            "SELECT * FROM compare_selection",
            "SELECT * FROM compare_suggestion",
            "SELECT * FROM voice_caption",
          ]);
      })
      .onConnectError((_ctx, error) => {
        console.warn("SpacetimeDB is not reachable; live updates are off.", error);
        setOffline();
      })
      .onDisconnect(() => setOffline())
      .build();
  } catch (error) {
    console.warn("SpacetimeDB connection failed", error);
    setOffline();
  }
  return connection;
}

function subscribe(listener: () => void) {
  connectToSpacetimeDB();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every SpacetimeDB row the site uses, kept live. */
export function useSpacetime(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Transcript rows for one call, oldest first. */
export function useCallTranscript(callId: string | null | undefined) {
  const { messages, sessions, status } = useSpacetime();
  const rows = callId ? messages.filter((m) => m.callId === callId).sort((a, b) => (a.id < b.id ? -1 : 1)) : [];
  const session = callId ? sessions.find((s) => s.callId === callId) ?? null : null;
  return { rows, session, status };
}

/** The newest call that belongs to this customer (web or phone), and its transcript. */
export function useLatestCustomerCall(customerId: string | null | undefined, since?: number) {
  const { owners, messages, sessions, status } = useSpacetime();
  const [startedAt] = useState(() => since ?? Date.now());
  const mine = customerId
    ? owners
        .filter((o) => o.customerId === customerId && Date.parse(o.startedAt) >= startedAt - 5 * 60_000)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    : [];
  const call = mine[0] ?? null;
  const rows = call ? messages.filter((m) => m.callId === call.callId).sort((a, b) => (a.id < b.id ? -1 : 1)) : [];
  const session = call ? sessions.find((s) => s.callId === call.callId) ?? null : null;
  return { call, rows, session, status };
}

/** This customer's AI-automated next-move steps, in order. */
export function useNextMoveRows(customerId: string | null | undefined) {
  const { nextMoves, status } = useSpacetime();
  const rows = customerId ? nextMoves.filter((r) => r.customerId === customerId).sort((a, b) => a.position - b.position) : [];
  return { rows, status };
}

/** Start the connection as soon as the app loads. */
export function useSpacetimeConnection() {
  useEffect(() => {
    connectToSpacetimeDB();
  }, []);
}

/** Is the live layer connected right now? */
export function useSpacetimeStatus() {
  return useSpacetime().status;
}

/** This customer's chat with Vroom AI, oldest first. */
export function useAssistantTurnRows(customerId: string | null | undefined) {
  const { assistantTurns, status } = useSpacetime();
  const rows = customerId ? assistantTurns.filter((r) => r.customerId === customerId).sort((a, b) => (a.id < b.id ? -1 : 1)) : [];
  return { rows, status };
}

/** The What-if settings the agent last chose for this customer. */
export function useDashboardState(customerId: string | null | undefined) {
  const { dashboards, status } = useSpacetime();
  return { row: customerId ? dashboards.find((r) => r.customerId === customerId) ?? null : null, status };
}

/** This customer's Compare selection, as synced across devices. */
export function useCompareSelectionRow(customerId: string | null | undefined) {
  const { compareSelections, status } = useSpacetime();
  return { row: customerId ? compareSelections.find((r) => r.customerId === customerId) ?? null : null, status };
}

/** The AI suggestions saved for this customer's Compare selection. */
export function useCompareSuggestionRow(customerId: string | null | undefined) {
  const { compareSuggestions, status } = useSpacetime();
  return { row: customerId ? compareSuggestions.find((r) => r.customerId === customerId) ?? null : null, status };
}

/** Latest live-caption snapshot for a voice call. */
export function useVoiceCaptionRow(callId: string | null | undefined) {
  const { voiceCaptions, status } = useSpacetime();
  return { row: callId ? voiceCaptions.find((r) => r.callId === callId) ?? null : null, status };
}

/** Run a reducer when connected; returns false (and the caller falls back) when the live layer is down. */
function callReducer(run: (conn: DbConnection) => Promise<void>): boolean {
  const conn = connectToSpacetimeDB();
  if (!conn || snapshot.status !== "live") return false;
  run(conn).catch((error) => console.warn("SpacetimeDB reducer failed", error));
  return true;
}

export function saveCompareSelection(customerId: string, ids: string[]) {
  return callReducer((c) => c.reducers.setCompareSelection({ customerId, idsJson: JSON.stringify(ids), updatedAt: new Date().toISOString() }));
}

export function clearAssistantHistory(customerId: string) {
  return callReducer((c) => c.reducers.clearAssistantTurns({ customerId }));
}
