import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Gauge,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AutoNextMoves } from "../components/insights/AutoNextMoves";
import { LoanSimulator } from "../components/insights/LoanSimulator";
import { AccountHero } from "../components/AccountHero";
import { NewAccountView } from "../components/NewAccountView";
import { isNewAccount } from "../lib/sessionProfile";
import { CountUp, Reveal, Stagger, StaggerItem } from "../components/ui/motion";
import type { Profile } from "../data/types";
import { addMonths, byYear, nextDueDate, payment, schedule } from "../lib/finance";
import { useDashboardCommand } from "../lib/dashboardBus";
import { cn, money } from "../lib/format";
import { journeyFor } from "../lib/journey";
import { useAssistant, usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

const RED = "#eb0a1e";
const INK = "#16171a";
const STEEL = "#c9ccd1";
const axis = { fontSize: 12, fill: "#5e5e5e" };
const usd = (n: number) => money(Math.round(n));
const usdShort = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Shared chart tooltip so every chart on the page reads the same. */
function ChartTip({
  active,
  payload,
  label,
  unit = "usd",
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; payload?: { fill?: string } }[];
  label?: string | number;
  unit?: "usd" | "mi";
}) {
  if (!active || !payload?.length) return null;
  const fmt = (n: number) => (unit === "mi" ? `${Math.round(n).toLocaleString("en-US")} mi` : usd(n));
  return (
    <div className="rounded-md border border-black/[0.06] bg-paper/95 px-3.5 py-2.5 text-xs shadow-[var(--shadow-lift)] backdrop-blur">
      {label != null && label !== "" && <div className="mb-1.5 font-semibold text-ink">{label}</div>}
      <div className="space-y-1">
        {payload.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: e.color || e.payload?.fill || INK }} />
              {e.name}
            </span>
            <span className="font-semibold tabular-nums text-ink">{fmt(Number(e.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SECTIONS_LOAN = [
  ["overview", "Overview"],
  ["progress", "Progress"],
  ["simulator", "Simulator"],
  ["scenarios", "Scenarios"],
  ["equity", "Equity"],
  ["next-moves", "Next moves"],
] as const;
const SECTIONS_LEASE = [
  ["overview", "Overview"],
  ["progress", "Progress"],
  ["scenarios", "Lease end"],
  ["next-moves", "Next moves"],
] as const;

function SectionNav({ lease }: { lease: boolean }) {
  const items = lease ? SECTIONS_LEASE : SECTIONS_LOAN;
  return (
    <nav
      aria-label="Insights sections"
      className="sticky top-16 z-20 md:top-[72px] -mx-5 overflow-x-auto px-5 py-2 md:-mx-8 md:px-8"
    >
      <div className="inline-flex gap-1 rounded-full border border-black/[0.06] bg-paper/85 p-1 shadow-[var(--shadow-soft)] backdrop-blur">
        {items.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function SectionLabel({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <div className={cn("flex items-center gap-4 pt-8", align === "right" && "flex-row-reverse")}>
      <h2 className="font-headline text-[clamp(2.75rem,5.5vw,4.25rem)] font-bold uppercase leading-none tracking-[0.04em] text-signal">{children}</h2>
      <span className="h-[2px] flex-1 bg-signal/20" />
    </div>
  );
}

export function InsightsPage() {
  const { profile } = useAuth();
  usePageContext("insights");
  if (!profile) return null;
  if (isNewAccount(profile)) return <NewAccountView key={profile.customer.customer_id} p={profile} eyebrow="Financial insights" />;
  return <Dashboard key={profile.customer.customer_id} p={profile} />;
}

function Dashboard({ p }: { p: Profile }) {
  const { customer: c, vehicle: v, account: a } = p;
  const { ask } = useAssistant();
  const journey = journeyFor(p);
  const isLoan = a.contract_type === "loan" && a.apr != null && a.current_balance != null;
  const due = nextDueDate(a.payment_due_day);
  const daysToDue = Math.ceil((due.getTime() - Date.now()) / 86_400_000);

  return (
    <main className="chart-font pb-24">
      <AccountHero
        p={p}
        eyebrow="Financial insights"
        title={`Hello, ${c.first_name}.`}
        stats={[
          ["Vehicle", `${v.model_year} ${v.model} ${v.trim}`],
          ["Contract", isLoan ? `Loan · ${a.apr}% APR` : "Lease"],
          ["Term", `${a.term_months} months`],
          ["Estimated value", money(v.est_market_value_now)],
        ]}
      >
        {isLoan ? "Retail installment loan" : "Lease"} with Toyota Financial Services
      </AccountHero>

      <div className="mx-auto max-w-7xl space-y-6 px-5 pt-6 md:px-8">
        <SectionNav lease={!isLoan} />
        <div id="overview" className="-mt-2 scroll-mt-36" />
        <Reveal>
          <div
            className={cn(
              "relative overflow-hidden rounded-md p-6 text-white md:p-8",
              journey.kind === "payment" || journey.kind === "safety" ? "bg-gradient-to-br from-[#3a0a10] to-charcoal" : "bg-gradient-to-br from-charcoal-2 to-charcoal"
            )}
          >
            <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/25 blur-[90px]" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-signal">{journey.eyebrow}</p>
            <h2 className="relative mt-3 max-w-[28ch] text-2xl font-semibold tracking-tight md:text-3xl">{journey.title}</h2>
            <p className="relative mt-3 max-w-2xl leading-relaxed text-white/75">{journey.body}</p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <Link to={journey.cta.to} className="btn-primary">
                {journey.cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <button onClick={() => ask(journey.prompt)} className="btn-ghost border-white/25 bg-white/5 text-white hover:bg-white/15">
                Ask Vroom AI
              </button>
            </div>
          </div>
        </Reveal>

        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Wallet} label="Monthly payment" value={a.monthly_payment} cents note={a.autopay === "Y" ? "Autopay is on" : "Autopay is off"} />
          {isLoan ? (
            <Kpi icon={Gauge} label="Remaining balance" value={a.current_balance!} note={`Payoff quote ${money(a.payoff_quote)}`} />
          ) : (
            <Kpi icon={Gauge} label="Residual value" value={a.residual_value ?? 0} note="Set by your lease agreement" />
          )}
          <Kpi
            icon={CalendarDays}
            label="Months remaining"
            value={a.months_remaining}
            plain
            note={`Ends ${fmtDate(new Date(a.contract_end + "T12:00:00"))}`}
            progress={a.months_elapsed / a.term_months}
          />
          <Kpi
            icon={CalendarClock}
            label="Next payment"
            value={a.monthly_payment}
            cents
            note={`${fmtDate(due)} · in ${daysToDue} day${daysToDue === 1 ? "" : "s"}`}
            dark
            highlight={journey.kind === "payment"}
          />
        </Stagger>

        <SectionLabel>{isLoan ? "Your loan" : "Your lease"}</SectionLabel>
        {isLoan ? <LoanInsights p={p} /> : <LeaseInsights p={p} />}

        <SectionLabel align="right">What to do next</SectionLabel>
        <Recommendations p={p} />

        <p className="text-xs leading-relaxed text-muted">
          Account figures come from the synthetic Toyota Financial Services data pack. Charts and scenarios are deterministic calculations from those
          figures, assuming on-time payments at the contract APR. They are illustrative and are not approvals or offers.
        </p>
      </div>
    </main>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  cents,
  plain,
  highlight,
  dark,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  note?: string;
  cents?: boolean;
  plain?: boolean;
  highlight?: boolean;
  dark?: boolean;
  progress?: number;
}) {
  const format = (n: number) => (plain ? Math.round(n).toString() : money(cents ? Math.round(n * 100) / 100 : n, cents));
  return (
    <StaggerItem
      className={cn(
        "card card-hover relative overflow-hidden rounded-md p-5",
        dark && "border-transparent bg-gradient-to-br from-charcoal-2 to-charcoal text-white",
        highlight && "ring-2 ring-signal/60"
      )}
    >
      {dark && <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-signal/30 blur-3xl" />}
      <div className="relative flex items-center justify-between">
        <span className={cn("text-sm font-medium", dark ? "text-white/70" : "text-muted")}>{label}</span>
        <span className={cn("grid h-9 w-9 place-items-center rounded-md", dark ? "bg-white/10 text-white" : "bg-signal/[0.08] text-signal")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3 text-[2rem] font-semibold leading-none tracking-tight tabular-nums">
        <CountUp value={value} format={format} />
      </div>
      {progress != null && (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-[#ececec]">
          <div className="h-full rounded-full bg-gradient-to-r from-ink to-steel" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
        </div>
      )}
      {note && <div className={cn("relative mt-2 text-xs", dark ? "text-white/60" : "text-muted")}>{note}</div>}
    </StaggerItem>
  );
}

function Panel({
  id,
  title,
  subtitle,
  children,
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Reveal as="section" className={cn("card scroll-mt-36 rounded-md p-6 md:p-7", className)}>
      <div id={id} className="scroll-mt-36" />
      <div className="border-b border-line pb-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </Reveal>
  );
}

/** Small labelled figure used inside panels. */
function Stat({ label, value, note, dot, tone }: { label: string; value: string; note?: string; dot?: string; tone?: "go" | "signal" }) {
  return (
    <div className="rounded-md bg-mist p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "go" && "text-go", tone === "signal" && "text-signal")}>{value}</div>
      {note && <div className="mt-0.5 text-[11px] leading-snug text-muted">{note}</div>}
    </div>
  );
}

/** Estimated value vs. what is owed, as one track. */
function EquityMeter({ value, owed, owedLabel }: { value: number; owed: number; owedLabel: string }) {
  const max = Math.max(value, owed, 1);
  const equity = value - owed;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-muted">{equity >= 0 ? "Estimated equity" : "Estimated shortfall"}</div>
          <div className={cn("mt-1 text-4xl font-semibold tracking-tight tabular-nums", equity >= 0 ? "text-go" : "text-signal")}>
            <CountUp value={Math.abs(equity)} format={(n) => money(Math.round(n))} />
          </div>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", equity >= 0 ? "bg-go/10 text-go" : "bg-signal/10 text-signal")}>
          {equity >= 0 ? "Positive" : "Negative"}
        </span>
      </div>
      <div className="relative mt-6 h-4 overflow-hidden rounded-full bg-[#ececec]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ink to-charcoal-3" style={{ width: `${(Math.min(owed, value) / max) * 100}%` }} />
        {equity >= 0 ? (
          <div
            className="absolute inset-y-0 rounded-r-full bg-go/70"
            style={{ left: `${(owed / max) * 100}%`, width: `${(equity / max) * 100}%` }}
          />
        ) : (
          <div
            className="absolute inset-y-0 rounded-r-full bg-signal/70"
            style={{ left: `${(value / max) * 100}%`, width: `${(-equity / max) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Estimated value" value={money(value)} dot={equity >= 0 ? "#1f8a70" : INK} />
        <Stat label={owedLabel} value={money(owed)} dot={INK} />
      </div>
    </div>
  );
}

function LoanInsights({ p }: { p: Profile }) {
  const a = p.account;
  const v = p.vehicle;
  const balance = a.current_balance!;
  const apr = a.apr!;
  const rows = useMemo(() => schedule(balance, apr, a.monthly_payment), [balance, apr, a.monthly_payment]);
  const interestLeft = rows.reduce((s, r) => s + r.interest, 0);
  const paidPrincipal = Math.max(a.amount_financed - balance, 0);
  const interestPaid = Math.max(a.monthly_payment * a.months_elapsed - paidPrincipal, 0);
  const yearly = byYear(rows);
  const due = nextDueDate(a.payment_due_day);
  const payoff = a.payoff_quote ?? balance;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel id="progress" title="Payment progress" subtitle={`${a.months_elapsed} of ${a.term_months} payments made · ${a.months_remaining} to go`}>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-stretch">
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Principal paid", value: paidPrincipal, fill: RED },
                      { name: "Principal remaining", value: balance, fill: "#ececec" },
                    ]}
                    dataKey="value"
                    innerRadius="74%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={2}
                    cornerRadius={10}
                    stroke="none"
                    animationDuration={1000}
                  >
                    <Cell fill={RED} />
                    <Cell fill="#ececec" />
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-4xl font-semibold tracking-tight tabular-nums">{Math.round((paidPrincipal / a.amount_financed) * 100)}%</div>
                  <div className="mt-1 text-xs text-muted">of {money(a.amount_financed)} repaid</div>
                </div>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 content-center gap-3">
              <Stat label="Principal paid" value={money(paidPrincipal)} dot={RED} />
              <Stat label="Principal remaining" value={money(balance)} dot="#d4d4d4" />
              <Stat label="Interest paid so far" value={`≈ ${money(interestPaid)}`} note="Scheduled payments minus principal paid" />
              <Stat label="Interest still to pay" value={money(interestLeft)} note="If every payment is on time" tone="signal" />
            </div>
          </div>
        </Panel>

        <Panel title="Loan amortization" subtitle={`Principal and interest by year at ${apr}% APR, from today's balance`}>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={yearly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPrincipal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34373d" />
                    <stop offset="100%" stopColor={INK} />
                  </linearGradient>
                  <linearGradient id="gInterest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff4a5a" />
                    <stop offset="100%" stopColor={RED} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#ececec" strokeDasharray="3 4" />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} width={56} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.04)", radius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="principal" name="Principal" stackId="p" fill="url(#gPrincipal)" maxBarSize={44} />
                <Bar dataKey="interest" name="Interest" stackId="p" fill="url(#gInterest)" radius={[8, 8, 0, 0]} maxBarSize={44} />
                <Line
                  dataKey="balance"
                  name="Balance at year end"
                  stroke="#8a8f98"
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: "#fff", stroke: "#8a8f98", strokeWidth: 2 }}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Reveal>
        <LoanSimulator p={p} />
      </Reveal>

      <Scenarios p={p} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="equity" title="Vehicle equity" subtitle={`${p.vehicle.model_year} ${p.vehicle.model}: estimated value compared with your payoff quote`}>
          <EquityMeter value={v.est_market_value_now} owed={payoff} owedLabel="Payoff quote" />
          <p className="mt-4 text-xs text-caution">The vehicle value is an estimate from the account record, not a guaranteed trade-in offer.</p>
        </Panel>

        <Panel title="Upcoming payments" subtitle="Next six scheduled payments, split by principal and interest">
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-2 pb-3 font-semibold">Due</th>
                  <th className="px-2 pb-3 text-right font-semibold">Payment</th>
                  <th className="px-2 pb-3 text-right font-semibold">Principal</th>
                  <th className="px-2 pb-3 text-right font-semibold">Interest</th>
                  <th className="px-2 pb-3 text-right font-semibold">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={r.month} className={cn("transition-colors hover:bg-mist", i === 0 ? "bg-signal/[0.05] font-semibold" : "border-t border-line")}>
                    <td className="rounded-l-md px-2 py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {fmtDate(addMonths(due, i))}
                        {i === 0 && <span className="rounded-full bg-signal px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Next</span>}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">{money(r.principal + r.interest, true)}</td>
                    <td className="px-2 py-3 text-right">{money(r.principal, true)}</td>
                    <td className="px-2 py-3 text-right text-signal">{money(r.interest, true)}</td>
                    <td className="rounded-r-md px-2 py-3 text-right text-muted">{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Scenarios({ p }: { p: Profile }) {
  const a = p.account;
  const balance = a.current_balance!;
  const apr = a.apr!;
  const [extend, setExtend] = useState(12);
  // Vroom AI can set the extension ("what would a 24-month extension do?"). The slider moves in 6-month steps.
  useDashboardCommand("scenario", ({ extend_months }) => {
    if (extend_months != null) setExtend(Math.min(24, Math.max(6, Math.round(extend_months / 6) * 6)));
  });

  const run = (monthly: number) => {
    const rows = schedule(balance, apr, monthly);
    const interest = rows.reduce((s, r) => s + r.interest, 0);
    return { monthly, months: rows.length, interest, total: balance + interest };
  };
  const keep = run(a.monthly_payment);
  const longer = run(payment(balance, apr, a.months_remaining + extend));
  const cols = [
    { key: "keep", title: "Keep as is", tag: "Current agreement", s: keep, color: INK },
    { key: "extend", title: `Extend ${extend} months`, tag: "Hypothetical · subject to eligibility and review", s: longer, color: RED },
  ];
  const humanHelp = p.customer.vulnerable_flag === "Y" || a.missed_payments_12m >= 1;

  return (
    <Panel id="scenarios" title="Lower payment, longer term?" subtitle={`Illustrative comparison at your ${apr}% APR. A term change needs Toyota Financial Services review and is not approved here.`}>
      <div className="max-w-md">
        <Slider label="Hypothetical extension" value={extend} min={6} max={24} step={6} suffix=" months" onChange={setExtend} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cols.map(({ key, title, tag, s, color }) => (
          <div key={key} className={cn("relative overflow-hidden rounded-md border p-5", key === "keep" ? "border-line bg-paper" : "border-signal/20 bg-signal/[0.03]")}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
            <div className="flex items-center gap-2">
              <span className="font-semibold">{title}</span>
            </div>
            <div className={cn("mt-1 text-xs", key === "extend" ? "font-semibold text-caution" : "text-muted")}>{tag}</div>
            <dl className="mt-4 space-y-2 text-sm">
              <Line2 label="Monthly payment" value={money(s.monthly, true)} delta={key === "keep" ? undefined : s.monthly - keep.monthly} />
              <Line2 label="Payments left" value={`${s.months}`} delta={key === "keep" ? undefined : s.months - keep.months} unit=" mo" />
              <Line2 label="Interest from today" value={money(s.interest)} delta={key === "keep" ? undefined : s.interest - keep.interest} />
              <Line2 label="Total still to pay" value={money(s.total)} />
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={cols.map((c) => ({ name: c.title, interest: Math.round(c.s.interest), color: c.color }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ececec" strokeDasharray="3 4" />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} width={56} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.04)", radius: 8 }} />
              <Bar dataKey="interest" name="Interest from today" radius={[10, 10, 0, 0]} maxBarSize={64} animationDuration={700}>
                {cols.map((c) => (
                  <Cell key={c.key} fill={c.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed">
          <li>
            <strong>Extending</strong> lowers the payment by {money(keep.monthly - longer.monthly, true)} a month but adds about {money(longer.interest - keep.interest)} in
            interest and {longer.months - keep.months} more payments.
          </li>
          <li>
            Want to pay it off sooner instead?{" "}
            <a href="#simulator" className="font-semibold text-signal">
              Try extra payments in the simulator
            </a>
            .
          </li>
          {humanHelp && (
            <li className="rounded-md bg-sodium/15 p-3">
              Your account shows recent payment stress, so a specialist reviews any hardship option first. Nothing here is submitted.
            </li>
          )}
          <li>
            <Link to="/my-toyota#options" className="font-semibold text-signal">
              See the options on your agreement <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          </li>
        </ul>
      </div>
    </Panel>
  );
}

function LeaseInsights({ p }: { p: Profile }) {
  const a = p.account;
  const v = p.vehicle;
  const projected = Math.round(v.odometer_now + (v.annual_miles_est * a.months_remaining) / 12);
  const allowance = a.mileage_allowance_total;
  const residual = a.residual_value;
  const gap = residual != null ? v.est_market_value_now - residual : null;
  const timeline = Array.from({ length: a.term_months }, (_, i) => ({ month: i + 1, paid: i < a.months_elapsed ? 1 : 0 }));

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel id="progress" title="Lease progress" subtitle={`${a.months_elapsed} of ${a.term_months} months`}>
          <div className="grid grid-cols-12 gap-1" aria-hidden>
            {timeline.map((m) => (
              <span key={m.month} className={cn("h-4 rounded-md", m.paid ? "bg-gradient-to-b from-charcoal-3 to-ink" : "bg-[#ececec]")} />
            ))}
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <Line2 label="Scheduled payments made" value={money(a.months_elapsed * a.monthly_payment)} note={`${a.months_elapsed} × ${money(a.monthly_payment, true)}`} />
            <Line2 label="Scheduled payments left" value={money(a.months_remaining * a.monthly_payment)} note={`${a.months_remaining} × ${money(a.monthly_payment, true)}`} />
            <Line2 label="Lease ends" value={fmtDate(new Date(a.contract_end + "T12:00:00"))} />
          </dl>
        </Panel>

        <Panel title="Mileage outlook" subtitle="Projected from your odometer and estimated yearly miles">
          {allowance ? (
            <>
              <div className="h-44">
                <ResponsiveContainer>
                  <BarChart layout="vertical" data={[{ name: "Projected at end", value: projected }, { name: "Allowance", value: allowance }]} margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={(n) => `${Math.round(Number(n) / 1000)}k`} />
                    <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={120} />
                    <Tooltip content={<ChartTip unit="mi" />} cursor={{ fill: "rgba(0,0,0,0.04)", radius: 8 }} />
                    <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={32}>
                      <Cell fill={projected > allowance ? RED : INK} />
                      <Cell fill={STEEL} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={cn("mt-2 font-semibold", projected > allowance ? "text-signal" : "text-go")}>
                {projected > allowance
                  ? `About ${(projected - allowance).toLocaleString("en-US")} miles over the allowance`
                  : `About ${(allowance - projected).toLocaleString("en-US")} miles under the allowance`}
              </p>
              <p className="mt-1 text-xs text-muted">Any excess-mileage charge is set by your lease. See the lease-end options for the amount.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Mileage allowance is not on this agreement.</p>
          )}
        </Panel>
      </div>

      <Panel id="scenarios" title="Lease-end picture" subtitle="Estimated vehicle value compared with the residual (buyout before fees)">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart layout="vertical" data={[{ name: "Estimated value", value: v.est_market_value_now }, { name: "Residual", value: residual ?? 0 }]} margin={{ left: 8, right: 24 }}>
                <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} />
                <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(0,0,0,0.04)", radius: 8 }} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={36}>
                  <Cell fill={INK} />
                  <Cell fill={STEEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            {gap != null && (
              <p className={cn("text-lg font-semibold", gap >= 0 ? "text-go" : "text-signal")}>
                Estimated value is {money(Math.abs(gap))} {gap >= 0 ? "above" : "below"} the residual
              </p>
            )}
            <p className="mt-1 text-xs text-caution">An estimate, not a guaranteed offer. Buyout fees and taxes are extra.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {p.options.map((o) => (
                <li key={o.option_id} className="flex items-start justify-between gap-3 border-b border-line pb-2">
                  <span>{o.option_name}</span>
                  <span className={cn("shrink-0 text-xs font-semibold", o.eligibility === "Y" ? "text-go" : "text-caution")}>
                    {o.eligibility === "Y" ? "Eligible" : o.eligibility === "N" ? "Not eligible" : "Needs review"}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/my-toyota#options" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-signal">
              Compare these options in detail <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Recommendations({ p }: { p: Profile }) {
  const { ask } = useAssistant();
  const isLease = p.account.contract_type === "lease";
  const prompts = isLease
    ? ["My lease ends soon. What are my options?", "Should I buy my leased car?", "Which Toyota could replace my current one?"]
    : ["Can you help me understand my monthly payment?", "What happens if I pay extra toward my loan?", "Could a longer term lower my payment, and what would it cost?"];
  return (
    <Panel id="next-moves" title="Your next moves" subtitle="Vroom AI works through these for you. Nothing on your agreement changes until you confirm it.">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <AutoNextMoves p={p} />
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-charcoal-2 to-charcoal p-5 text-white">
          <div aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-signal/25 blur-3xl" />
          <p className="relative flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-signal" /> Ask Toyota Vroom AI
          </p>
          <p className="relative mt-1 text-xs text-white/60">Tap a question to start a conversation about your account.</p>
          <div className="relative mt-4 flex flex-col gap-2">
            {prompts.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="group flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-left text-sm transition-colors hover:border-white/30 hover:bg-white/10"
              >
                {q}
                <ArrowRight className="h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  prefix = "",
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block rounded-md bg-mist p-4 text-sm">
      <span className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="font-semibold tabular-nums">
          {prefix}
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[#eb0a1e]"
      />
    </label>
  );
}

function Line2({ label, value, note, dot, delta, unit }: { label: string; value: string; note?: string; dot?: string; delta?: number; unit?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted">
        {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}
        <span>
          {label}
          {note && <span className="block text-xs text-muted/80">{note}</span>}
        </span>
      </dt>
      <dd className="text-right font-semibold">
        {value}
        {delta != null && Math.abs(delta) >= 0.5 && (
          <span className={cn("block text-xs font-medium", delta > 0 ? "text-signal" : "text-go")}>
            {delta > 0 ? "+" : "−"}
            {unit ? `${Math.abs(Math.round(delta))}${unit}` : money(Math.abs(delta))}
          </span>
        )}
      </dd>
    </div>
  );
}