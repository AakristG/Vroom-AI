/**
 * In-browser voice call via a server-minted Retell v3 access token (the same Nemotron agent that
 * answers the phone). RETELL_API_KEY and RETELL_AGENT_ID stay on the backend.
 * Docs: https://docs.retellai.com/deploy/web-call
 *
 * Transcript updates go to `onTranscript` so the chat box can show the conversation as it happens.
 * The backend also writes every turn to SpacetimeDB and saves the call.
 */
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { createVerifiedWebCall } from "../api/client";

export type VoiceStatus = "idle" | "connecting" | "live" | "ended" | "error";
export type VoiceTurn = { role: "agent" | "user"; content: string };

/** Kept for callers that check whether voice can be offered; the backend decides now. */
export const retellConfigured = true;

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
  const [status, setStatusState] = useState<VoiceStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRef = useRef<RetellWebClient | null>(null);
  const callIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const handlers = useRef({ onTranscript, onStatus });
  handlers.current = { onTranscript, onStatus };

  const setStatus = (next: VoiceStatus) => {
    setStatusState(next);
    handlers.current.onStatus?.(next, callIdRef.current);
  };

  useEffect(() => () => clientRef.current?.stopCall(), []);

  function getClient(): RetellWebClient {
    if (!clientRef.current) {
      const client = new RetellWebClient();
      client.on("call_started", () => setStatus("live"));
      client.on("call_ended", () => {
        setStatus("ended");
        setMuted(false);
      });
      client.on("error", (error: Error) => {
        setErrorMessage(error?.message || "The voice call failed.");
        setStatus("error");
        client.stopCall();
      });
      client.on("update", (update: { transcript?: { role: string; content: string }[] }) => {
        const turns = (update.transcript ?? [])
          .filter((u) => u.content?.trim() && (u.role === "agent" || u.role === "user"))
          .map((u) => ({ role: u.role as "agent" | "user", content: u.content }));
        handlers.current.onTranscript?.(turns, callIdRef.current);
      });
      clientRef.current = client;
    }
    return clientRef.current;
  }

  async function startCall() {
    if (startingRef.current || status === "connecting" || status === "live") return;
    startingRef.current = true;
    setErrorMessage(null);
    setMuted(false);
    setStatus("connecting");
    try {
      const minted = await createVerifiedWebCall();
      if (!minted.access_token || !minted.call_id) {
        throw new Error(minted.detail || "The server did not return a usable voice session.");
      }
      callIdRef.current = minted.call_id;
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
      setStatus("error");
    } finally {
      startingRef.current = false;
    }
  }

  function endCall() {
    clientRef.current?.stopCall();
    setMuted(false);
    setStatus("ended");
  }

  function toggleMute() {
    if (muted) clientRef.current?.unmute();
    else clientRef.current?.mute();
    setMuted((m) => !m);
  }

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
