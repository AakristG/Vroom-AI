/**
 * In-browser voice call via a server-minted Retell v3 access token.
 * RETELL_API_KEY and RETELL_AGENT_ID stay on the backend; the browser never creates calls with a public key.
 * Docs: https://docs.retellai.com/deploy/web-call
 */
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { createVerifiedWebCall } from "../api/client";

type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

export function VoiceWidget({ variant = "dark" }: { variant?: "light" | "dark"; customerId?: string }) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRef = useRef<RetellWebClient | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    return () => {
      void endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

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
      });
      clientRef.current = client;
    }
    return clientRef.current;
  }

  async function startCall() {
    if (startingRef.current || status === "connecting" || status === "live") return;
    startingRef.current = true;
    setErrorMessage(null);
    setStatus("connecting");
    setMuted(false);
    try {
      const minted = await createVerifiedWebCall();
      if (!minted.access_token || !minted.call_id) {
        throw new Error(minted.detail || "The server did not return a usable voice session.");
      }
      await getClient().startCall({
        accessToken: minted.access_token,
        callId: minted.call_id,
        ...(minted.transport ? { transport: minted.transport as "gateway" | "livekit" } : {}),
        ...(minted.ice_servers ? { iceServers: minted.ice_servers } : {}),
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not start the voice call.");
      setStatus("error");
    } finally {
      startingRef.current = false;
    }
  }

  async function endCall() {
    clientRef.current?.stopCall();
    setMuted(false);
  }

  function toggleMute() {
    if (muted) clientRef.current?.unmute();
    else clientRef.current?.mute();
    setMuted((m) => !m);
  }

  const active = status === "connecting" || status === "live";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <button onClick={endCall} className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-deep">
              <PhoneOff className="h-4 w-4" /> {status === "connecting" ? "Connecting…" : "Hang up"}
            </button>
            {status === "live" ? (
              <button
                onClick={toggleMute}
                className={
                  variant === "light"
                    ? "flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-daylight"
                    : "flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium hover:bg-white/10"
                }
              >
                {muted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {muted ? "Unmute" : "Mute"}
              </button>
            ) : null}
          </>
        ) : (
          <button
            onClick={startCall}
            className={
              variant === "light"
                ? "flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-daylight"
                : "flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium hover:bg-white/10"
            }
          >
            <Mic className="h-4 w-4" /> Call from this browser
          </button>
        )}
      </div>
      {errorMessage && <p className="mt-2 max-w-xs text-xs text-sodium">{errorMessage}</p>}
    </div>
  );
}
