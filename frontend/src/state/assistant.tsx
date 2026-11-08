import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AssistantAction, AssistantContext, AssistantTool } from "../api/client";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: AssistantTool[];
  actions?: AssistantAction[];
  offline?: boolean;
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
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
}

const Ctx = createContext<Assistant | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [context, setContext] = useState<AssistantContext>({ page: "home" });
  const [turns, setTurns] = useState<Turn[]>([]);

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
    }),
    [open, pending, context, turns]
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
    };
    window.addEventListener("tfs-auth-logout", onOut);
    return () => window.removeEventListener("tfs-auth-logout", onOut);
  }, [setOpen, setTurns, clearPending]);
  return null;
}
