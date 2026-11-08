import { useEffect, useState } from "react";
import { confirmPendingAction, type PendingActionCard } from "../api/client";
import { requestActivityRefresh } from "../lib/activityRefresh";

export function ConfirmActionCard({
  action,
  onDone,
  onChange,
}: {
  action: PendingActionCard;
  onDone?: () => void;
  onChange?: (action: PendingActionCard) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(action);

  useEffect(() => {
    setCurrent(action);
  }, [action]);

  async function send(stage: "intent" | "execute" | "cancel") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await confirmPendingAction(current.action_id, stage);
      setCurrent(next);
      onChange?.(next);
      requestActivityRefresh();
      if (next.status === "completed" || next.status === "cancelled" || stage === "cancel") onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That confirmation did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (current.status === "completed") {
    const emailStatus = typeof current.result?.email_status === "string" ? current.result.email_status : "";
    const detail = typeof current.result?.detail === "string" ? current.result.detail : "Nothing on your contract changed.";
    return (
      <div className="rounded-2xl bg-go/10 px-4 py-3 text-sm" role="status">
        <p className="font-medium">Request recorded.</p>
        <p className="mt-1 text-muted">{detail}</p>
        {emailStatus === "failed" || emailStatus === "not_sent" || emailStatus === "not_configured" ? (
          <p className="mt-2 text-caution">Your request was saved, but the confirmation email could not be sent.</p>
        ) : null}
      </div>
    );
  }

  if (current.status === "cancelled") {
    return <p className="rounded-2xl border border-line px-4 py-3 text-sm text-muted">That request was cancelled. Nothing on your account changed.</p>;
  }

  return (
    <div className="rounded-2xl border border-line p-4 text-sm">
      <p className="font-semibold">{current.stage === "final" ? "Final confirmation" : "Confirm these details"}</p>
      <p className="mt-2 text-muted">{current.summary}</p>
      {error ? <p className="mt-2 text-signal">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {current.stage === "intent" ? (
          <button disabled={busy} onClick={() => void send("intent")} className="btn-primary px-4 py-2 text-xs">
            Yes, those details are correct
          </button>
        ) : null}
        {current.stage === "final" ? (
          <button disabled={busy} onClick={() => void send("execute")} className="btn-primary px-4 py-2 text-xs">
            Go ahead and record this request
          </button>
        ) : null}
        <button disabled={busy} onClick={() => void send("cancel")} className="btn-ghost border-line px-4 py-2 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
