/**
 * In-browser voice call using Retell AI's Web SDK (v3, `RetellClient`).
 * Docs: https://docs.retellai.com/deploy/web-call
 *
 * Needs VITE_RETELL_PUBLIC_KEY + VITE_RETELL_AGENT_ID set in frontend/.env.
 * The public key must have `localhost` (or your deployed domain) in its allowed domains list
 * in the Retell dashboard.
 */
import { useRef, useState } from "react";
import { RetellClient } from "retell-client-js-sdk";

const PUBLIC_KEY = import.meta.env.VITE_RETELL_PUBLIC_KEY ?? "";
const AGENT_ID = import.meta.env.VITE_RETELL_AGENT_ID ?? "";

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
    if (!PUBLIC_KEY || !AGENT_ID) {
      setErrorMessage("Set VITE_RETELL_PUBLIC_KEY and VITE_RETELL_AGENT_ID in frontend/.env");
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

  return (
    <div className="voice-widget">
      <p>Status: {status}</p>
      {errorMessage && <p className="voice-widget-error">{errorMessage}</p>}
      {status === "idle" || status === "ended" || status === "error" ? (
        <button onClick={startCall}>Start call</button>
      ) : (
        <button onClick={endCall}>End call</button>
      )}
    </div>
  );
}
