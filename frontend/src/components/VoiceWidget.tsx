/**
 * In-browser voice call using Retell AI's Web SDK (v3, `RetellClient`).
 * Docs: https://docs.retellai.com/deploy/web-call
 *
 * Needs VITE_RETELL_PUBLIC_KEY + VITE_RETELL_AGENT_ID set in frontend/.env.
 * The public key must have `localhost` (or your deployed domain) in its allowed domains list
 * in the Retell dashboard.
 *
 * Restyled as a compact button for the console's call panel. Live transcript rows arrive
 * through SpacetimeDB (see hooks/useLiveCall.ts), not from this component.
 */
import { Mic, PhoneOff } from "lucide-react";
import { useRef, useState } from "react";
import { RetellClient } from "retell-client-js-sdk";

const PUBLIC_KEY = import.meta.env.VITE_RETELL_PUBLIC_KEY ?? "";
const AGENT_ID = import.meta.env.VITE_RETELL_AGENT_ID ?? "";
export const retellConfigured = Boolean(PUBLIC_KEY && AGENT_ID);

type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

export function VoiceWidget() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRef = useRef<RetellClient | null>(null);
  const callRef = useRef<ReturnType<RetellClient["createWebCall"]> | null>(null);

  function getClient(): RetellClient {
    if (!clientRef.current) {
      clientRef.current = new RetellClient({ key: PUBLIC_KEY });
    }
    return clientRef.current;
  }

  async function startCall() {
    if (!retellConfigured) {
      setErrorMessage("Add VITE_RETELL_PUBLIC_KEY and VITE_RETELL_AGENT_ID to frontend/.env to call from the browser.");
      setStatus("error");
      return;
    }
    setErrorMessage(null);
    setStatus("connecting");
    callRef.current = getClient().createWebCall({
      agent_id: AGENT_ID,
      hooks: {
        onStatus: (s) => setStatus(s as CallStatus),
        onEnd: () => setStatus("ended"),
        onError: (error) => {
          setErrorMessage(error.message);
          setStatus("error");
        },
      },
    });
  }

  async function endCall() {
    await callRef.current?.end();
  }

  const active = status === "connecting" || status === "live";

  return (
    <div>
      {active ? (
        <button onClick={endCall} className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-medium hover:bg-signal-deep">
          <PhoneOff className="h-4 w-4" /> {status === "connecting" ? "Connecting…" : "Hang up"}
        </button>
      ) : (
        <button
          onClick={startCall}
          className="flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          <Mic className="h-4 w-4" /> Call from browser
        </button>
      )}
      {errorMessage && <p className="mt-2 max-w-xs text-xs text-sodium">{errorMessage}</p>}
    </div>
  );
}
