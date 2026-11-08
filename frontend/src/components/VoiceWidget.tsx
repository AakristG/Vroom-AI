/**
 * In-browser voice call via a server-minted Retell v3 access token (the same Nemotron agent that
 * answers the phone). RETELL_API_KEY and RETELL_AGENT_ID stay on the backend.
 * Docs: https://docs.retellai.com/deploy/web-call
 *
 * Caption sources (no second STT stack, no Retell API key in the browser):
 * 1. RetellWebClient data-channel `update` + `agent_start/stop_talking` (gateway transport).
 * 2. Authenticated backend caption WebSocket `/ws/captions/<call_id>/` fed by the Custom LLM path.
 * 3. Authenticated `/api/voice/live/` poll as a fallback if the caption socket fails.
 */
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { TOKEN_KEY, createVerifiedWebCall, fetchVoiceLiveSnapshot } from "../api/client";
import { useVoiceSession, type VoiceStatus } from "../state/voiceSession";

export type { VoiceStatus };
/** @deprecated Prefer VoiceCaption from voice session; kept for older call sites. */
export type VoiceTurn = { role: "agent" | "user"; content: string };

/** Kept for callers that check whether voice can be offered; the backend decides now. */
export const retellConfigured = true;

function captionWsUrl(callId: string, token: string): string {
  const api = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  const base = api.replace(/^http/i, (m: string) => (m.toLowerCase() === "https" ? "wss" : "ws")).replace(/\/$/, "");
  return `${base}/ws/captions/${encodeURIComponent(callId)}/?token=${encodeURIComponent(token)}`;
}

function turnsFromPayload(turns: unknown): { role: "agent" | "user"; content: string; id?: string }[] {
  if (!Array.isArray(turns)) return [];
  const out: { role: "agent" | "user"; content: string; id?: string }[] = [];
  for (const raw of turns) {
    const t = raw as { role?: string; content?: string; id?: string };
    const role = t.role === "user" ? "user" : t.role === "agent" || t.role === "assistant" ? "agent" : null;
    const content = (t.content || "").trim();
    if (!role || !content) continue;
    out.push(t.id ? { role, content, id: t.id } : { role, content });
  }
  return out;
}

export function VoiceWidget({
  variant = "dark",
  onTranscript,
  onStatus,
}: {
  variant?: "light" | "dark";
  customerId?: string;
  onTranscript?: (turns: VoiceTurn[], callId: string | null) => void;
  onStatus?: (status: VoiceStatus, callId: string | null) => void;
}) {
  const voice = useVoiceSession();
  const [muted, setMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRef = useRef<RetellWebClient | null>(null);
  const callIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const captionSocketRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const sawProviderTranscript = useRef(false);
  const handlers = useRef({ onTranscript, onStatus, voice });
  handlers.current = { onTranscript, onStatus, voice };

  const setStatus = (next: VoiceStatus) => {
    handlers.current.voice.setCallMeta(next, callIdRef.current);
    handlers.current.onStatus?.(next, callIdRef.current);
  };

  function stopCaptionFeeds() {
    if (captionSocketRef.current) {
      captionSocketRef.current.onclose = null;
      captionSocketRef.current.close();
      captionSocketRef.current = null;
    }
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function applyTurns(
    callId: string,
    turns: { role: "agent" | "user"; content: string; id?: string }[],
    meta?: { turntaking?: string; eventSeq?: number }
  ) {
    if (turns.length) sawProviderTranscript.current = true;
    handlers.current.voice.applyProviderTurns(callId, turns, meta);
    handlers.current.onTranscript?.(
      turns.map(({ role, content }) => ({ role, content })),
      callId
    );
  }

  function startPolling(callId: string) {
    if (pollTimerRef.current != null) return;
    const tick = async () => {
      if (callIdRef.current !== callId) return;
      try {
        const snap = await fetchVoiceLiveSnapshot();
        if (callIdRef.current !== callId) return;
        if (snap.call_id && snap.call_id !== callId) return;
        const turns = turnsFromPayload(snap.turns);
        if (turns.length) applyTurns(callId, turns, { eventSeq: snap.sequence });
      } catch {
        // Voice call continues; captions may still arrive from the Retell data channel.
        if (!sawProviderTranscript.current) handlers.current.voice.setCaptionsUnavailable(true);
      }
    };
    void tick();
    pollTimerRef.current = window.setInterval(() => void tick(), 700);
  }

  function startCaptionRelay(callId: string) {
    stopCaptionFeeds();
    sawProviderTranscript.current = false;
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      startPolling(callId);
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(captionWsUrl(callId, token));
    } catch {
      startPolling(callId);
      return;
    }
    captionSocketRef.current = socket;
    let opened = false;
    const fallback = window.setTimeout(() => {
      if (!opened) startPolling(callId);
    }, 2500);
    socket.onopen = () => {
      opened = true;
      window.clearTimeout(fallback);
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string;
          call_id?: string;
          turns?: unknown;
          sequence?: number;
          status?: string;
        };
        if (data.type !== "caption_snapshot") return;
        if (data.call_id && data.call_id !== callId) return;
        const turns = turnsFromPayload(data.turns);
        applyTurns(callId, turns, { eventSeq: data.sequence });
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onerror = () => {
      if (!sawProviderTranscript.current) handlers.current.voice.setCaptionsUnavailable(true);
    };
    socket.onclose = () => {
      window.clearTimeout(fallback);
      if (callIdRef.current === callId && handlers.current.voice.status === "live") startPolling(callId);
    };
  }

  function getClient(): RetellWebClient {
    if (!clientRef.current) {
      const client = new RetellWebClient();
      client.on("call_started", () => {
        setStatus("live");
        if (callIdRef.current) startCaptionRelay(callIdRef.current);
      });
      client.on("call_ended", () => {
        stopCaptionFeeds();
        if (callIdRef.current) handlers.current.voice.endCaptions(callIdRef.current);
        setMuted(false);
        setStatus("ended");
      });
      client.on("error", (error: Error) => {
        setErrorMessage(error?.message || "The voice call failed.");
        stopCaptionFeeds();
        if (callIdRef.current) handlers.current.voice.endCaptions(callIdRef.current);
        setStatus("error");
        client.stopCall();
      });
      client.on("update", (update: { transcript?: { role: string; content: string }[]; turntaking?: string }) => {
        const callId = callIdRef.current;
        if (!callId) return;
        const turns = turnsFromPayload(update.transcript);
        applyTurns(callId, turns, { turntaking: update.turntaking });
        if (update.turntaking === "user_turn") handlers.current.voice.setUserListening(true);
        else if (update.turntaking === "agent_turn") handlers.current.voice.setUserListening(false);
      });
      client.on("agent_start_talking", () => {
        const callId = callIdRef.current;
        if (callId) handlers.current.voice.setAgentSpeaking(callId, true);
      });
      client.on("agent_stop_talking", () => {
        const callId = callIdRef.current;
        if (callId) handlers.current.voice.setAgentSpeaking(callId, false);
      });
      clientRef.current = client;
    }
    return clientRef.current;
  }

  useEffect(() => {
    return () => {
      stopCaptionFeeds();
      clientRef.current?.stopCall();
    };
  }, []);

  async function startCall() {
    if (startingRef.current || voice.status === "connecting" || voice.status === "live") return;
    startingRef.current = true;
    setErrorMessage(null);
    setMuted(false);
    callIdRef.current = null;
    setStatus("connecting");
    try {
      const minted = await createVerifiedWebCall();
      if (!minted.access_token || !minted.call_id) {
        throw new Error(minted.detail || "The server did not return a usable voice session.");
      }
      callIdRef.current = minted.call_id;
      handlers.current.voice.setCallMeta("connecting", minted.call_id);
      await getClient().startCall({
        accessToken: minted.access_token,
        callId: minted.call_id,
        ...(minted.transport ? { transport: minted.transport as "gateway" | "livekit" } : {}),
        ...(minted.ice_servers ? { iceServers: minted.ice_servers } : {}),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setErrorMessage(
        name === "NotAllowedError" ? "Allow microphone access to talk to the agent." : err instanceof Error ? err.message : "Could not start the voice call."
      );
      stopCaptionFeeds();
      setStatus("error");
    } finally {
      startingRef.current = false;
    }
  }

  function endCall() {
    stopCaptionFeeds();
    if (callIdRef.current) handlers.current.voice.endCaptions(callIdRef.current);
    clientRef.current?.stopCall();
    setMuted(false);
    setStatus("ended");
  }

  function toggleMute() {
    if (muted) clientRef.current?.unmute();
    else clientRef.current?.mute();
    setMuted((m) => !m);
  }

  const status = voice.status;
  const active = status === "connecting" || status === "live";
  const secondary =
    variant === "light"
      ? "flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-daylight"
      : "flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium hover:bg-white/10";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <button onClick={endCall} className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-deep">
              <PhoneOff className="h-4 w-4" /> {status === "connecting" ? "Connecting…" : "Hang up"}
            </button>
            {status === "live" && (
              <button onClick={toggleMute} className={secondary}>
                {muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
          </>
        ) : (
          <button onClick={startCall} className={secondary}>
            <Mic className="h-4 w-4" /> Talk to the AI
          </button>
        )}
      </div>
      {errorMessage && <p className="mt-2 max-w-xs text-xs text-signal">{errorMessage}</p>}
    </div>
  );
}
