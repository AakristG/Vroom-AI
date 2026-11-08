import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Hand, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { runNextMoves, type AssistantAction, type NextMovePlan, type NextMoveStep } from "../../api/client";
import type { Profile } from "../../data/types";
import { cn } from "../../lib/format";
import { useNextMoveRows } from "../../spacetime/client";
import { ActionButton } from "../assistant/AssistantChat";

const STATUS: Record<NextMoveStep["status"], { icon: typeof Check; label: string; tone: string }> = {
  working: { icon: Loader2, label: "Working on it", tone: "bg-mist text-ink/70" },
  done: { icon: Check, label: "Done by the AI", tone: "bg-go/10 text-go" },
  needs_you: { icon: Hand, label: "Your call", tone: "bg-signal/10 text-signal" },
  blocked: { icon: CircleAlert, label: "Needs attention", tone: "bg-sodium/20 text-caution" },
};

function parseAction(json: string): AssistantAction | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AssistantAction;
  } catch {
    return null;
  }
}

/**
 * "Your next moves", automated. On load the assistant works through the plan by itself (reviews the
 * agreement, checks eligibility, runs the numbers, looks for recalls and service) and each step
 * appears live from SpacetimeDB as it finishes. Only the decisions are left for the customer.
 */
export function AutoNextMoves({ p }: { p: Profile }) {
  const customerId = p.customer.customer_id;
  const live = useNextMoveRows(customerId);
  const [plan, setPlan] = useState<NextMovePlan | null>(null);
  const [state, setState] = useState<"running" | "ready" | "error">("running");
  const [runs, setRuns] = useState(0);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${customerId}:${runs}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    let alive = true;
    setState("running");
    setPlan(null);
    runNextMoves()
      .then((r) => {
        if (!alive) return;
        setPlan(r);
        setState(r.error ? "error" : "ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [customerId, runs]);

  // Live rows win while the run is in flight; the HTTP response is the fallback without SpacetimeDB.
  const liveSteps: NextMoveStep[] = live.rows.map((r) => ({
    key: r.stepKey,
    title: r.title,
    detail: r.detail,
    status: r.status as NextMoveStep["status"],
    action: parseAction(r.actionJson),
  }));
  const steps = state === "running" ? liveSteps : plan?.steps?.length ? plan.steps : liveSteps;
  const done = steps.filter((s) => s.status === "done").length;
  const decisions = steps.filter((s) => s.status === "needs_you" || s.status === "blocked").length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-signal">
            <Sparkles className="h-3.5 w-3.5" />
            {state === "running" ? "NextMove AI is working through your plan…" : `${done} done for you · ${decisions} left for you`}
          </p>
          {state === "running" && !plan ? (
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-black/[0.06]" />
              <div className="h-3 w-3/5 animate-pulse rounded-full bg-black/[0.06]" />
            </div>
          ) : plan?.summary ? (
            <p className="mt-3 max-w-[70ch] text-lg leading-relaxed text-ink/85">{plan.summary}</p>
          ) : null}
          {state === "error" && <p className="mt-3 text-sm text-signal">The assistant couldn't finish your plan. Your account is unchanged.</p>}
        </div>
        <button
          onClick={() => setRuns((n) => n + 1)}
          disabled={state === "running"}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", state === "running" && "animate-spin")} /> Run again
        </button>
      </div>

      <ol className="mt-6 space-y-3">
        <AnimatePresence initial={false}>
          {steps.map((s, i) => {
            const meta = STATUS[s.status] ?? STATUS.done;
            const Icon = meta.icon;
            return (
              <motion.li
                key={s.key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={cn("flex gap-4 rounded-2xl border p-4", s.status === "needs_you" ? "border-signal/30 bg-signal/[0.03]" : "border-line bg-paper")}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", meta.tone)}>
                  <Icon className={cn("h-4 w-4", s.status === "working" && "animate-spin")} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">Step {i + 1}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.tone)}>{meta.label}</span>
                  </div>
                  <p className="mt-1 font-semibold">{s.title}</p>
                  {s.detail && <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>}
                  {s.action && s.status !== "working" && (
                    <div className="mt-3">
                      <ActionButton action={s.action} customerId={customerId} name={p.customer.first_name} />
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      <p className="mt-4 text-xs text-muted">
        The AI only reads your account and runs the numbers. Anything that changes your agreement waits for you to confirm it.
      </p>
    </div>
  );
}
