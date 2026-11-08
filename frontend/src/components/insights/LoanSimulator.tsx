import { AnimatePresence, motion } from "motion/react";
import { ChartLine, Info, RotateCcw, Sparkles, Table2 } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Profile } from "../../data/types";
import { addMonths, nextDueDate, simulate, type Simulation } from "../../lib/finance";
import { cn, money } from "../../lib/format";
import { useAssistant } from "../../state/assistant";
import { AnimatedNumber, EASE } from "../ui/motion";

const RED = "#eb0a1e";
const INK = "#16171a";
const axis = { fontSize: 12, fill: "#5e5e5e" };
const usd = (n: number) => money(Math.round(n));
const usdShort = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** Balance at the end of each month, padded so both series share one x-axis. */
function balanceSeries(start: number, base: Simulation, sim: Simulation) {
  const length = Math.max(base.months, sim.months);
  const at = (s: Simulation, i: number) => (i === 0 ? start - s.lumpSum : i <= s.rows.length ? s.rows[i - 1].balance : 0);
  return Array.from({ length: length + 1 }, (_, i) => ({ month: i, current: at(base, i), simulated: at(sim, i) }));
}

export function LoanSimulator({ p, selfReported = false }: { p: Profile; selfReported?: boolean }) {
  const a = p.account;
  const balance = a.current_balance!;
  const apr = a.apr!;
  const { ask } = useAssistant();
  const maxExtra = 500;
  const maxLump = Math.max(0, Math.min(5_000, Math.floor(balance / 100) * 100));
  const [extra, setExtra] = useState(100);
  const [lump, setLump] = useState(0);
  const [view, setView] = useState<"chart" | "table">("chart");

  const base = useMemo(() => simulate({ balance, apr, monthly: a.monthly_payment }), [balance, apr, a.monthly_payment]);
  const sim = useMemo(() => simulate({ balance, apr, monthly: a.monthly_payment, extraMonthly: extra, lumpSum: lump }), [balance, apr, a.monthly_payment, extra, lump]);
  const series = useMemo(() => balanceSeries(balance, base, sim), [balance, base, sim]);

  const due = nextDueDate(a.payment_due_day);
  const payoff = (s: Simulation) => (s.months > 0 ? addMonths(due, s.months - 1) : due);
  const monthsSaved = base.months - sim.months;
  const interestSaved = base.totalInterest - sim.totalInterest;
  const changed = extra > 0 || lump > 0;

  const assumptions = [
    selfReported
      ? `Starts from the balance you entered, ${money(balance, true)}, at the APR you entered, ${apr}%. Neither is checked against your agreement.`
      : `Starts from the current balance of ${money(balance, true)} at the contract APR of ${apr}%.`,
    `Uses ${selfReported ? "the payment you entered" : "the payment on file"}, ${money(a.monthly_payment, true)} a month, and assumes every payment is on time.`,
    "Extra amounts are applied entirely to principal. Confirm how your agreement applies extra payments.",
    "Interest accrues monthly on the remaining balance. A final payment under $1 is settled with the last payment.",
  ];

  function explain() {
    const parts = [
      extra > 0 ? `paying an extra ${money(extra)} every month` : null,
      lump > 0 ? `making a one-time ${money(lump)} principal payment now` : null,
    ].filter(Boolean);
    ask(
      `Explain this loan scenario for me: ${parts.join(" and ") || "keeping my current payment"}. ` +
        `The simulator estimated a payoff in ${sim.months} payments instead of ${base.months}, ` +
        `about ${money(Math.max(interestSaved, 0))} less interest, with ${money(sim.monthly, true)} a month. ` +
        `Please check these figures with your extra-payment tool and tell me what I should watch out for.`
    );
  }

  return (
    <section id="simulator" className="card scroll-mt-28 overflow-hidden" aria-labelledby="simulator-title">
      <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-line p-6 md:p-8 lg:border-b-0 lg:border-r">
          <p className="eyebrow">What if?</p>
          <h2 id="simulator-title" className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            What if I paid a little more?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Move the sliders to see how extra principal changes your payoff date and the interest left on your loan. Estimates only — not an offer or an
            approval.
          </p>

          <div className="mt-6 space-y-4">
            <RangeField label="Extra each month" value={extra} min={0} max={maxExtra} step={10} onChange={setExtra} format={(n) => `+${money(n)}/mo`} />
            {maxLump > 0 && (
              <RangeField label="One-time principal payment" value={lump} min={0} max={maxLump} step={100} onChange={setLump} format={(n) => money(n)} />
            )}
          </div>

          {changed && (
            <button
              type="button"
              onClick={() => {
                setExtra(0);
                setLump(0);
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" /> Reset to current schedule
            </button>
          )}

          <details className="group mt-6 rounded-2xl bg-mist p-4 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
              <Info className="h-4 w-4 text-muted" /> Show how this was calculated
            </summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
              {assumptions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>

        <div className="p-6 md:p-8">
          {sim.valid && base.valid ? (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Stat label="Monthly payment" value={<AnimatedNumber value={sim.monthly} format={(n) => money(n, true)} />} note={extra > 0 ? `${money(a.monthly_payment, true)} ${selfReported ? "now" : "on file"}` : selfReported ? "What you pay now" : "On file"} />
                <Stat
                  label="Paid off"
                  value={monthYear(payoff(sim))}
                  note={`${sim.months} payments${changed ? ` · was ${monthYear(payoff(base))}` : ""}`}
                />
                <Stat
                  label="Months saved"
                  value={<AnimatedNumber value={monthsSaved} format={(n) => `${Math.round(n)}`} />}
                  tone={monthsSaved > 0 ? "go" : undefined}
                />
                <Stat
                  label="Interest saved"
                  value={<AnimatedNumber value={Math.max(interestSaved, 0)} format={usd} />}
                  note={`${usd(sim.totalInterest)} left to pay, was ${usd(base.totalInterest)}`}
                  tone={interestSaved >= 1 ? "go" : undefined}
                />
              </dl>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm font-semibold">Balance over time</p>
                <div role="tablist" aria-label="Balance view" className="flex rounded-full bg-mist p-1 text-xs">
                  {(
                    [
                      ["chart", "Chart", ChartLine],
                      ["table", "Table", Table2],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={view === key}
                      onClick={() => setView(key)}
                      className={cn(
                        "relative flex items-center gap-1 rounded-full px-3 py-1.5 font-medium transition-colors duration-150",
                        view === key ? "text-white" : "text-muted hover:text-ink"
                      )}
                    >
                      {view === key && <motion.span layoutId="sim-view" className="absolute inset-0 rounded-full bg-ink" transition={{ duration: 0.25, ease: EASE }} />}
                      <Icon className="relative h-3.5 w-3.5" />
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-3">
                  {view === "chart" ? (
                    <div className="h-56" role="img" aria-label={`Balance reaches zero after ${sim.months} payments with the changes, compared with ${base.months} on the current schedule.`}>
                      <BalanceChart data={series} />
                    </div>
                  ) : (
                    <YearTable data={series} due={due} />
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button onClick={explain} className="btn-primary">
                  <Sparkles className="h-4 w-4" /> Ask Toyota AI to explain this scenario
                </button>
                <span className="text-xs text-muted">Estimate · not an approval or offer</span>
              </div>
            </>
          ) : (
            <div role="alert" className="rounded-2xl border border-sodium/40 bg-sodium/10 p-5 text-sm">
              We can't project a payoff from the figures on file: the monthly payment does not cover the interest that accrues each month. A Toyota
              Financial Services specialist can review the account.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BalanceChart({ data }: { data: ReturnType<typeof balanceSeries> }) {
  const gid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sim${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={RED} stopOpacity={0.25} />
            <stop offset="1" stopColor={RED} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#ececec" />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} tickFormatter={(m) => (m % 12 === 0 ? `Yr ${m / 12}` : "")} interval={0} />
        <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} width={56} />
        <Tooltip formatter={(n) => usd(Number(n))} labelFormatter={(m) => `After payment ${m}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="current" name="Current schedule" type="monotone" stroke={INK} strokeWidth={2} fill="none" isAnimationActive={false} />
        <Area dataKey="simulated" name="With your changes" type="monotone" stroke={RED} strokeWidth={2} fill={`url(#sim${gid})`} animationDuration={400} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function YearTable({ data, due }: { data: ReturnType<typeof balanceSeries>; due: Date }) {
  const rows = data.filter((d) => d.month > 0 && (d.month % 12 === 0 || d.month === data.length - 1));
  return (
    <div className="max-h-56 overflow-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">Remaining balance by year, current schedule compared with the simulated changes</caption>
        <thead className="sticky top-0 bg-paper text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">After</th>
            <th className="px-4 py-2 text-right font-medium">Current</th>
            <th className="px-4 py-2 text-right font-medium">With changes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-t border-line">
              <td className="px-4 py-2">{monthYear(addMonths(due, r.month - 1))}</td>
              <td className="px-4 py-2 text-right">{usd(r.current)}</td>
              <td className="px-4 py-2 text-right font-semibold">{usd(r.simulated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "go" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold tracking-tight md:text-3xl", tone === "go" && "text-go")}>{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="text-lg font-semibold tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        className="range mt-3 w-full"
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
