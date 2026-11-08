import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AssistantAction, AssistantContext, AssistantTool } from "../api/client";
import { clearAssistantHistory, useAssistantTurnRows, type AssistantTurnRow } from "../spacetime/client";
import { useAuth } from "./auth";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: AssistantTool[];
  actions?: AssistantAction[];
  offline?: boolean;
  /** Spoken in a voice call (browser or phone), shown as a transcript line. */
  voice?: boolean;
  /** Voice caption stopped early because the customer interrupted. */
  voiceInterrupted?: boolean;
  /** This reply ended the conversation; the next message starts a new one. */
  ended?: "callback_scheduled" | "farewell";
}

interface Assistant {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Open the dock and send a prompt on the user's behalf. */
  ask: (prompt: string) => void;
  pending: string | null;
  clearPending: () => void;
  context: AssistantContext;
  setContext: (ctx: AssistantContext) => void;
  /** The conversation: SpacetimeDB history for this customer plus any local turns not synced yet. */
  turns: Turn[];
  /** Local (optimistic and voice) turns. */
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  /** "Clear": empties the conversation here and on every other tab and device. */
  clearConversation: () => void;
}

function parseJson<T>(raw: string): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function rowToTurn(r: AssistantTurnRow): Turn {
  return {
    id: r.turnId,
    role: r.role === "user" ? "user" : "assistant",
    content: r.offline && !r.content ? "Nemotron is offline right now, so there's no written answer. Here is what the backend tools found:" : r.content,
    tools: parseJson<AssistantTool[]>(r.toolsJson),
    actions: parseJson<AssistantAction[]>(r.actionsJson),
    offline: r.offline || undefined,
  };
}

const Ctx = createContext<Assistant | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [context, setContext] = useState<AssistantContext>({ page: "home" });
  const [localTurns, setTurns] = useState<Turn[]>([]);
  const { profile } = useAuth();
  const customerId = profile?.customer.customer_id ?? null;
  const { rows } = useAssistantTurnRows(customerId);
  // History lives in SpacetimeDB, so every tab and device shows the same conversation. Local turns
  // that have not landed there yet (the message being sent, voice transcript lines) follow it.
  const turns = useMemo(() => {
    const endedById = new Map(localTurns.filter((t) => t.ended).map((t) => [t.id, t.ended]));
    const remote = rows.map((r) => {
      const t = rowToTurn(r);
      const ended = endedById.get(t.id);
      return ended ? { ...t, ended } : t;
    });
    const seen = new Set(remote.map((t) => t.id));
    return [...remote, ...localTurns.filter((t) => !seen.has(t.id))];
  }, [rows, localTurns]);

  const value = useMemo<Assistant>(
    () => ({
      open,
      setOpen,
      ask: (prompt) => {
        setPending(prompt);
        setOpen(true);
      },
      pending,
      clearPending: () => setPending(null),
      context,
      setContext,
      turns,
      setTurns,
      clearConversation: () => {
        setTurns([]);
        if (customerId) clearAssistantHistory(customerId);
      },
    }),
    [open, pending, context, turns, customerId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant must be used inside AssistantProvider");
  return ctx;
}

/** Tell the assistant what this page is showing. */
export function usePageContext(page: string, vehicles: string[] = []) {
  const { setContext } = useAssistant();
  const key = vehicles.join(",");
  useEffect(() => {
    setContext({ page, vehicles: key ? key.split(",") : [] });
  }, [page, key, setContext]);
}

export function AssistantLogoutListener() {
  const { setOpen, setTurns, clearPending } = useAssistant();
  useEffect(() => {
    const onOut = () => {
      setTurns([]);
      setOpen(false);
      clearPending();
      window.dispatchEvent(new Event("tfs-voice-clear"));
    };
    window.addEventListener("tfs-auth-logout", onOut);
    return () => window.removeEventListener("tfs-auth-logout", onOut);
  }, [setOpen, setTurns, clearPending]);
  return null;
}
