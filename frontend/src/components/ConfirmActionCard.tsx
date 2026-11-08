import { useState } from "react";
import { confirmPendingAction, type PendingActionCard } from "../api/client";

export function ConfirmActionCard({ action, onDone }: { action: PendingActionCard; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(stage: "intent" | "execute" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      await confirmPendingAction(action.action_id, stage);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That confirmation did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (action.status === "completed") {
    return (
      <p className="rounded-2xl bg-go/10 px-4 py-3 text-sm">
        Request recorded. {typeof action.result?.detail === "string" ? action.result.detail : "Nothing on your contract changed."}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-line p-4 text-sm">
      <p className="font-semibold">{action.stage === "final" ? "Final confirmation" : "Confirm these details"}</p>
      <p className="mt-2 text-muted">{action.summary}</p>
      {error ? <p className="mt-2 text-signal">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {action.stage === "intent" ? (
          <button disabled={busy} onClick={() => send("intent")} className="btn-primary px-4 py-2 text-xs">
            Yes, those details are correct
          </button>
        ) : null}
        {action.stage === "final" ? (
          <button disabled={busy} onClick={() => send("execute")} className="btn-primary px-4 py-2 text-xs">
            Go ahead and record this request
          </button>
        ) : null}
        <button disabled={busy} onClick={() => send("cancel")} className="btn-ghost border-line px-4 py-2 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
