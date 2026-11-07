import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Option, Profile } from "../data/types";
import { cn, delta, money } from "../lib/format";

function eligibility(o: Option) {
  const e = o.eligibility;
  if (e === "Y") return { label: "Eligible", cls: "bg-go/12 text-go", reason: "" };
  if (e === "Review") return { label: "Needs review", cls: "bg-sodium/20 text-caution", reason: "" };
  if (e.startsWith("Caution")) return { label: "Caution", cls: "bg-sodium/20 text-caution", reason: e.replace(/^Caution\s*\(|\)$/g, "") };
  return { label: "Not eligible", cls: "bg-ink/8 text-muted", reason: e.replace(/^N\s*\(|\)$/g, "") };
}

/**
 * Every precomputed option for this customer, with a diverging bar showing total cost vs keeping
 * things as they are. Left (green) saves money over the contract; right (red) costs more later.
 */
export function OptionsCompare({ p }: { p: Profile }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...p.options.map((o) => Math.abs(o.total_cost_vs_keep_as_is ?? 0)));
  const best = p.golden.offer_id;

  return (
    <section className="rounded-2xl border border-line bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-6">
        <div>
          <h3 className="font-display text-3xl tracking-wide">Every option, side by side</h3>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            All numbers are precomputed from the contract and rate sheet. The agent explains them; it never invents them.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-go" /> Saves over the contract
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-signal" /> Costs more later
          </span>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.5fr)_6rem_5rem_minmax(11rem,1.2fr)_1.25rem] gap-4 px-6 pt-4 text-xs text-muted md:grid">
        <span>Option</span>
        <span className="text-right">New monthly</span>
        <span className="text-right">Upfront</span>
        <span className="text-center">Total vs. keeping as is</span>
        <span />
      </div>

      <ul className="divide-y divide-line">
        {p.options.map((o) => {
          const e = eligibility(o);
          const t = o.total_cost_vs_keep_as_is;
          const w = t == null ? 0 : (Math.abs(t) / max) * 26; // max 26% of the track so the label still fits
          const isBest = o.option_id === best;
          const isOpen = open === o.option_id;
          return (
            <li key={o.option_id} className={cn(isBest && "bg-signal/[0.04]")}>
              <button
                onClick={() => setOpen(isOpen ? null : o.option_id)}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[1fr_2rem] items-center gap-4 px-6 py-4 text-left md:grid-cols-[minmax(0,1.5fr)_6rem_5rem_minmax(11rem,1.2fr)_1.25rem]"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.option_name}</span>
                    {isBest && <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-medium text-white">Recommended</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", e.cls)}>{e.label}</span>
                  </span>
                  {e.reason && <span className="mt-0.5 block text-xs text-muted">{e.reason}</span>}
                  {/* mobile figures */}
                  <span className="mt-1 block text-sm text-muted md:hidden">
                    {o.new_monthly_payment != null && <>{money(o.new_monthly_payment)}/mo ({delta(o.monthly_payment_change)}) · </>}
                    Total {delta(t)}
                  </span>
                </span>
                <span className="hidden text-right md:block">
                  {o.new_monthly_payment != null ? (
                    <>
                      <span className="font-semibold">{money(o.new_monthly_payment)}</span>
                      <span
                        className={cn(
                          "block text-xs",
                          (o.monthly_payment_change ?? 0) < 0 ? "text-go" : (o.monthly_payment_change ?? 0) > 0 ? "text-signal" : "text-muted"
                        )}
                      >
                        {Math.abs(o.monthly_payment_change ?? 0) < 0.5 ? "No change" : `${delta(o.monthly_payment_change)}/mo`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </span>
                <span className="hidden text-right md:block">{o.upfront_cost ? money(o.upfront_cost) : <span className="text-muted">$0</span>}</span>
                <span className="hidden items-center md:flex">
                  {t == null ? (
                    <span className="w-full text-center text-xs text-muted">Not comparable</span>
                  ) : (
                    <span className="relative flex h-6 w-full items-center">
                      <span className="absolute left-1/2 h-full w-px bg-line" />
                      <span
                        className={cn("absolute h-2.5 rounded-sm", t < 0 ? "bg-go" : "bg-signal")}
                        style={t < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }}
                      />
                      <span
                        className={cn("absolute text-xs font-medium", t < -0.5 ? "text-go" : t > 0.5 ? "text-signal" : "text-muted")}
                        style={t < 0 ? { right: `calc(50% + ${w}% + 6px)` } : { left: `calc(50% + ${w}% + 6px)` }}
                      >
                        {delta(t)}
                      </span>
                    </span>
                  )}
                </span>
                <ChevronDown className={cn("h-5 w-5 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4 px-6 pb-5 text-sm md:grid-cols-3">
                      <p className="leading-relaxed md:col-span-1">{o.plain_language_summary}</p>
                      <p className="leading-relaxed text-muted">
                        <span className="font-medium text-ink">Trade-off: </span>
                        {o.tradeoff}
                      </p>
                      <p className="leading-relaxed text-caution">
                        <span className="font-medium">Assumes: </span>
                        {o.key_assumption}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
