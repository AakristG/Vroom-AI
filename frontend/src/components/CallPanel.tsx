import { Play, Square, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Profile } from "../data/types";
import { useLiveCall } from "../hooks/useLiveCall";
import { cn } from "../lib/format";
const VoiceWidget = lazy(() => import("./VoiceWidget").then((m) => ({ default: m.VoiceWidget })));

export function CallPanel({ p }: { p: Profile }) {
  const { state, turns, steps, mode, startDemo, end } = useLiveCall(p);
  const [tab, setTab] = useState<"transcript" | "agent">("transcript");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, steps, tab]);

  const running = state === "connecting" || state === "live";

  return (
    <aside className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-2xl bg-night text-white lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-wide">Call with {p.customer.first_name}</h2>
          <span className="text-xs text-white/60">
            {state === "idle" ? "Ready" : state === "connecting" ? "Connecting" : state === "live" ? "Live" : "Ended"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {running ? (
            <button onClick={end} className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-medium hover:bg-signal-deep">
              <Square className="h-3.5 w-3.5" /> Stop demo
            </button>
          ) : (
            <button onClick={startDemo} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-night hover:bg-white/90">
              <Play className="h-3.5 w-3.5" /> {state === "ended" ? "Replay demo call" : "Play demo call"}
            </button>
          )}
          <Suspense fallback={null}>
            <VoiceWidget customerId={p.customer.customer_id} />
          </Suspense>
        </div>
        <div role="tablist" className="mt-4 flex gap-1 rounded-full bg-white/5 p-1 text-sm">
          {(
            [
              ["transcript", "Transcript"],
              ["agent", `Agent steps${steps.length ? ` (${steps.length})` : ""}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("flex-1 rounded-full px-3 py-1.5", tab === id ? "bg-white/15 text-white" : "text-white/60 hover:text-white")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-5" aria-live="polite">
        {tab === "transcript" ? (
          turns.length === 0 ? (
            <p className="text-sm leading-relaxed text-white/60">
              Play the demo call to hear how the agent handles {p.customer.first_name}'s situation, or call from the browser once Retell is
              configured. {mode === "live" ? "Live transcripts stream in from SpacetimeDB." : "Live transcripts will stream in from SpacetimeDB once bindings are generated."}
            </p>
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {turns.map((t) => (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        t.role === "user" ? "rounded-br-sm bg-white text-night" : "rounded-bl-sm bg-night-3 text-white"
                      )}
                    >
                      {t.role === "agent" && <span className="mb-0.5 block text-[11px] text-white/50">Nemotron agent</span>}
                      {t.content}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )
        ) : steps.length === 0 ? (
          <p className="text-sm leading-relaxed text-white/60">
            Each tool the agent calls shows up here: verifying the caller, reading the contract, pulling only precomputed options, applying
            guardrails, then recommending one next step.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-white/15 pl-5">
            {steps.map((s) => (
              <motion.li key={s.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="relative">
                <span className="absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-sodium" />
                <div className="flex items-center gap-1.5 font-mono text-xs text-sodium">
                  <Wrench className="h-3 w-3" /> {s.tool}()
                </div>
                <div className="mt-0.5 text-sm text-white/80">{s.detail}</div>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
      <p className="border-t border-white/10 px-5 py-3 text-[11px] text-white/45">Synthetic data. Demo call is scripted from the data pack.</p>
    </aside>
  );
}
