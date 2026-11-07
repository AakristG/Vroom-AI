/**
 * Live call state for the console.
 *
 * - "live" mode: subscribes to SpacetimeDB `call_session` + `call_message` (written by the Django
 *   backend while a Retell call runs) and streams new transcript rows into the panel.
 * - "demo" mode: if bindings haven't been generated yet (DbConnection is the placeholder) or the
 *   connection fails, plays a scripted call built from the selected customer's data-pack record,
 *   so the UI is always demoable.
 *
 * NOTE: call_message must be declared `public: true` in spacetimedb/server/src/index.ts or the
 * browser can't subscribe to it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "../data/types";
import { money } from "../lib/format";
import { connectToSpacetimeDB } from "../spacetime/client";
import { DbConnection } from "../spacetime/module_bindings";

export type Turn = { id: string; role: "agent" | "user"; content: string };
export type Step = { id: string; tool: string; detail: string };
export type CallState = "idle" | "connecting" | "live" | "ended";

function script(p: Profile): { turns: Turn[]; steps: Step[] } {
  const a = p.account;
  const eligible = p.options.filter((o) => o.eligibility === "Y").length;
  const isLease = a.contract_type === "lease";
  const vulnerable = p.customer.vulnerable_flag === "Y" || a.missed_payments_12m >= 2;
  const turns: Turn[] = [
    { id: "t1", role: "agent", content: `Thanks for calling Toyota Financial Services. I can see your ${p.vehicle.model_year} ${p.vehicle.model}. What's going on today, ${p.customer.first_name}?` },
    { id: "t2", role: "user", content: p.situation.customer_says },
    {
      id: "t3",
      role: "agent",
      content: `Let me confirm what's on your ${isLease ? "lease" : "loan"}: ${money(a.monthly_payment, true)} a month with ${a.months_remaining} months left. Is that right?`,
    },
    { id: "t4", role: "user", content: "Yes, that's right." },
    { id: "t5", role: "agent", content: p.golden.plain_language_message },
    {
      id: "t6",
      role: "agent",
      content: vulnerable
        ? "I'd like a specialist to look at this with you before anything changes. Can I set that up?"
        : `The next step is: ${p.golden.best_next_move.toLowerCase()}. Want me to start that? Nothing changes until you say yes.`,
    },
  ];
  const steps: Step[] = [
    { id: "s1", tool: "verify_caller", detail: `Matched ${p.customer.customer_id} by phone + DOB (simulated)` },
    { id: "s2", tool: "extract_situation", detail: p.situation.context_summary },
    { id: "s3", tool: "get_account", detail: `${a.account_id}: ${a.contract_type}, ${money(a.monthly_payment, true)}/mo, ${a.months_remaining} mo left` },
    { id: "s4", tool: "confirm_values", detail: "Read back payment and term before using them" },
    { id: "s5", tool: "get_options", detail: `${p.options.length} precomputed options, ${eligible} eligible` },
    { id: "s6", tool: "check_guardrails", detail: vulnerable ? "Vulnerable → no upsell, route to specialist" : p.customer.marketing_consent === "N" ? "No marketing consent → no vehicle offers" : "No restrictions" },
    { id: "s7", tool: "recommend", detail: `${p.golden.offer_id} → ${p.golden.next_step_type}` },
  ];
  return { turns, steps };
}

export function useLiveCall(p: Profile) {
  const [state, setState] = useState<CallState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [mode, setMode] = useState<"live" | "demo">(DbConnection ? "live" : "demo");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Reset when the selected customer changes.
  useEffect(() => {
    clear();
    setState("idle");
    setTurns([]);
    setSteps([]);
  }, [p.customer.customer_id]);

  // Live: subscribe to SpacetimeDB rows once real bindings exist.
  useEffect(() => {
    if (!DbConnection) return;
    try {
      const conn: any = connectToSpacetimeDB();
      conn?.db?.call_message?.onInsert?.((_ctx: unknown, row: any) => {
        setTurns((t) => [...t, { id: String(row.id), role: row.role === "user" ? "user" : "agent", content: row.content }]);
      });
      conn?.db?.call_session?.onUpdate?.((_ctx: unknown, _old: any, row: any) => {
        setState(row.status === "ended" || row.status === "analyzed" ? "ended" : "live");
      });
    } catch {
      setMode("demo");
    }
  }, []);

  const startDemo = useCallback(() => {
    clear();
    const { turns: T, steps: S } = script(p);
    setTurns([]);
    setSteps([]);
    setState("connecting");
    let t = 700;
    timers.current.push(window.setTimeout(() => setState("live"), t));
    // Interleave agent steps with the conversation so the "thinking" is visible.
    const plan: [number, () => void][] = [
      [0, () => setTurns((x) => [...x, T[0]])],
      [1400, () => setTurns((x) => [...x, T[1]])],
      [800, () => setSteps((x) => [...x, S[0], S[1]])],
      [700, () => setSteps((x) => [...x, S[2]])],
      [600, () => setTurns((x) => [...x, T[2]])],
      [300, () => setSteps((x) => [...x, S[3]])],
      [1500, () => setTurns((x) => [...x, T[3]])],
      [700, () => setSteps((x) => [...x, S[4]])],
      [700, () => setSteps((x) => [...x, S[5]])],
      [700, () => setSteps((x) => [...x, S[6]])],
      [500, () => setTurns((x) => [...x, T[4]])],
      [2600, () => setTurns((x) => [...x, T[5]])],
      [1200, () => setState("ended")],
    ];
    for (const [gap, fn] of plan) {
      t += gap;
      timers.current.push(window.setTimeout(fn, t));
    }
  }, [p]);

  const end = useCallback(() => {
    clear();
    setState("ended");
  }, []);

  useEffect(() => clear, []);

  return { state, turns, steps, mode, startDemo, end };
}
