import { Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "../data/types";
import { useLiveCall } from "../hooks/useLiveCall";
import { cn } from "../lib/format";
import { VoiceWidget } from "./VoiceWidget";

const stepTitle: Record<string, string> = {
  verify_caller: "Confirmed this is your account",
  extract_situation: "Noted what you told us",
  get_account: "Read your contract",
  confirm_values: "Read your payment back to you",
  get_options: "Looked up options on your agreement",
  check_guardrails: "Checked the rules that apply to you",
  recommend: "Prepared a next step for you to approve",
};

export function CustomerTalk({ p }: { p: Profile }) {
  const { state, turns, steps, startDemo, end } = useLiveCall(p);
  const scroller = useRef<HTMLDivElement>(null);
  const [showChecks, setShowChecks] = useState(false);
  const running = state === "connecting" || state === "live";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, steps]);

  return (
    <section id="talk" className="rounded-3xl border border-line bg-paper p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Talk with Toyota Financial</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Hear how a conversation about your situation would go. Dollar amounts are repeated before they are used. This demo does not change your account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button onClick={end} className="rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-deep">
              End conversation
            </button>
          ) : (
            <button onClick={startDemo} className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">
              <Phone className="h-4 w-4" /> {state === "ended" ? "Replay" : "Play a sample call"}
            </button>
          )}
          <VoiceWidget variant="light" />
        </div>
      </div>

      <div ref={scroller} className="mt-6 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-[#f7f7f7] p-4" aria-live="polite">
        {turns.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            Press play to walk through {p.customer.first_name}'s situation with the numbers already on this account.
          </p>
        ) : (
          turns.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  t.role === "user" ? "bg-ink text-white" : "bg-paper text-ink shadow-sm"
                )}
              >
                <div className={cn("mb-1 text-[11px]", t.role === "user" ? "text-white/60" : "text-muted")}>
                  {t.role === "user" ? "You" : "Toyota Financial"}
                </div>
                {t.content}
              </div>
            </div>
          ))
        )}
      </div>

      {steps.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowChecks((v) => !v)} className="text-sm font-medium text-signal">
            {showChecks ? "Hide" : "Show"} what we checked ({steps.length})
          </button>
          {showChecks && (
            <ol className="mt-3 space-y-3 text-sm">
              {steps.map((s) => (
                <li key={s.id}>
                  <div className="font-medium">{stepTitle[s.tool] ?? s.tool}</div>
                  <div className="text-muted">{s.detail}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
