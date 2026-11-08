import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyAgentSpeaking,
  finalizeCallCaptions,
  reconcileSnapshot,
  type ProviderTurn,
  type VoiceCaption,
} from "../lib/voiceCaptions";

export type VoiceStatus = "idle" | "connecting" | "live" | "ended" | "error";

interface VoiceSessionValue {
  status: VoiceStatus;
  callId: string | null;
  captions: VoiceCaption[];
  agentSpeaking: boolean;
  userListening: boolean;
  captionsUnavailable: boolean;
  setCallMeta: (status: VoiceStatus, callId: string | null) => void;
  applyProviderTurns: (callId: string, turns: ProviderTurn[], meta?: { turntaking?: string; eventSeq?: number }) => void;
  setAgentSpeaking: (callId: string, speaking: boolean) => void;
  setUserListening: (listening: boolean) => void;
  setCaptionsUnavailable: (unavailable: boolean) => void;
  endCaptions: (callId: string | null) => VoiceCaption[];
  clearVoiceSession: () => void;
}

const Ctx = createContext<VoiceSessionValue | null>(null);

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<VoiceCaption[]>([]);
  const [agentSpeaking, setAgentSpeakingState] = useState(false);
  const [userListening, setUserListening] = useState(false);
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);
  const eventSeq = useRef(0);
  const agentSpeakingRef = useRef(false);

  const setCallMeta = useCallback((next: VoiceStatus, id: string | null) => {
    setStatus(next);
    setCallId(id);
    if (next === "connecting") {
      eventSeq.current = 0;
      setCaptions([]);
      setCaptionsUnavailable(false);
      setUserListening(false);
      setAgentSpeakingState(false);
      agentSpeakingRef.current = false;
    }
    if (next === "live") setCaptionsUnavailable(false);
  }, []);

  const applyProviderTurns = useCallback(
    (id: string, turns: ProviderTurn[], meta?: { turntaking?: string; eventSeq?: number }) => {
      const seq = meta?.eventSeq ?? ++eventSeq.current;
      eventSeq.current = Math.max(eventSeq.current, seq);
      setCaptions((prev) =>
        reconcileSnapshot(prev, id, turns, {
          agentSpeaking: agentSpeakingRef.current,
          turntaking: meta?.turntaking,
          eventSeq: seq,
        })
      );
      if (turns.some((t) => (t.content || "").trim())) setCaptionsUnavailable(false);
      if (meta?.turntaking === "user_turn") setUserListening(true);
      else if (meta?.turntaking === "agent_turn") setUserListening(false);
    },
    []
  );

  const setAgentSpeaking = useCallback((id: string, speaking: boolean) => {
    agentSpeakingRef.current = speaking;
    setAgentSpeakingState(speaking);
    if (speaking) setUserListening(false);
    setCaptions((prev) => applyAgentSpeaking(prev, id, speaking));
  }, []);

  const endCaptions = useCallback((id: string | null) => {
    agentSpeakingRef.current = false;
    setAgentSpeakingState(false);
    setUserListening(false);
    let finalized: VoiceCaption[] = [];
    setCaptions((prev) => {
      finalized = id ? finalizeCallCaptions(prev, id) : prev.map((c) => ({ ...c, isSpeaking: false, isFinal: true }));
      return finalized;
    });
    return finalized;
  }, []);

  const clearVoiceSession = useCallback(() => {
    eventSeq.current = 0;
    agentSpeakingRef.current = false;
    setStatus("idle");
    setCallId(null);
    setCaptions([]);
    setAgentSpeakingState(false);
    setUserListening(false);
    setCaptionsUnavailable(false);
  }, []);

  useEffect(() => {
    const onClear = () => clearVoiceSession();
    window.addEventListener("tfs-voice-clear", onClear);
    window.addEventListener("tfs-auth-logout", onClear);
    return () => {
      window.removeEventListener("tfs-voice-clear", onClear);
      window.removeEventListener("tfs-auth-logout", onClear);
    };
  }, [clearVoiceSession]);

  const value = useMemo(
    () => ({
      status,
      callId,
      captions,
      agentSpeaking,
      userListening,
      captionsUnavailable,
      setCallMeta,
      applyProviderTurns,
      setAgentSpeaking,
      setUserListening,
      setCaptionsUnavailable,
      endCaptions,
      clearVoiceSession,
    }),
    [
      status,
      callId,
      captions,
      agentSpeaking,
      userListening,
      captionsUnavailable,
      setCallMeta,
      applyProviderTurns,
      setAgentSpeaking,
      endCaptions,
      clearVoiceSession,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoiceSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVoiceSession must be used inside VoiceSessionProvider");
  return ctx;
}
