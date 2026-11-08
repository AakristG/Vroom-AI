/**
 * Frontend connection to SpacetimeDB: live call transcripts and the AI-automated next moves.
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

type Snapshot = {
  status: "connecting" | "live" | "offline";
  messages: CallMessage[];
  sessions: CallSession[];
  owners: CallOwner[];
  nextMoves: NextMoveRow[];
};

let snapshot: Snapshot = { status: "connecting", messages: [], sessions: [], owners: [], nextMoves: [] };
const listeners = new Set<() => void>();
let connection: DbConnection | null = null;

function emit(conn: DbConnection) {
  snapshot = {
    status: "live",
    messages: [...conn.db.callMessage.iter()] as CallMessage[],
    sessions: [...conn.db.callSession.iter()] as CallSession[],
    owners: [...conn.db.callOwner.iter()] as CallOwner[],
    nextMoves: [...conn.db.nextMove.iter()] as NextMoveRow[],
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
        for (const table of [conn.db.callMessage, conn.db.callSession, conn.db.callOwner, conn.db.nextMove] as any[]) {
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
