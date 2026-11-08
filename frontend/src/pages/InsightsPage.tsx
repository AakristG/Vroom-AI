import { ArrowRight, CalendarClock, Gauge, Sparkles, Wallet } from "lucide-react";
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
    <main className="pb-24">
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

      <div className="mx-auto max-w-7xl space-y-6 px-5 pt-8 md:px-8">
        <Reveal>
          <div
            className={cn(
              "relative overflow-hidden rounded-3xl p-6 text-white md:p-8",
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
                <Sparkles className="h-4 w-4" /> Ask NextMove AI
              </button>
            </div>
          </div>
        </Reveal>

        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Monthly payment" value={a.monthly_payment} cents />
          {isLoan ? (
            <Kpi icon={<Gauge className="h-4 w-4" />} label="Remaining balance" value={a.current_balance!} note={`Payoff quote ${money(a.payoff_quote)}`} />
          ) : (
            <Kpi icon={<Gauge className="h-4 w-4" />} label="Residual value" value={a.residual_value ?? 0} note="Set by your lease agreement" />
          )}
          <Kpi icon={<CalendarClock className="h-4 w-4" />} label="Months remaining" value={a.months_remaining} plain note={`Ends ${fmtDate(new Date(a.contract_end + "T12:00:00"))}`} />
          <Kpi
            icon={<CalendarClock className="h-4 w-4" />}
            label="Next payment"
            value={a.monthly_payment}
            cents
            note={`${fmtDate(due)} · in ${daysToDue} day${daysToDue === 1 ? "" : "s"}${a.autopay === "Y" ? " · autopay" : ""}`}
            highlight={journey.kind === "payment"}
          />
        </Stagger>

        {isLoan ? <LoanInsights p={p} /> : <LeaseInsights p={p} />}

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
  icon,
  label,
  value,
  note,
  cents,
  plain,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  note?: string;
  cents?: boolean;
  plain?: boolean;
  highlight?: boolean;
}) {
  const format = (n: number) => (plain ? Math.round(n).toString() : money(cents ? Math.round(n * 100) / 100 : n, cents));
  return (
    <StaggerItem className={cn("card p-5", highlight && "ring-2 ring-signal/50")}>
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">
        <CountUp value={value} format={format} />
      </div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </StaggerItem>
  );
}

function Panel({ id, title, subtitle, children, className }: { id?: string; title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Reveal as="section" className={cn("card scroll-mt-28 p-6 md:p-7", className)}>
      <div id={id} className="scroll-mt-28" />
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </Reveal>
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
  const equity = v.est_market_value_now - payoff;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Payment progress" subtitle={`${a.months_elapsed} of ${a.term_months} payments made`}>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-48 w-48 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Principal paid", value: paidPrincipal },
                      { name: "Principal remaining", value: balance },
                    ]}
                    dataKey="value"
                    innerRadius="70%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    animationDuration={1000}
                  >
                    <Cell fill={RED} />
                    <Cell fill="#ececec" />
                  </Pie>
                  <Tooltip formatter={(n) => usd(Number(n))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-2xl font-semibold">{Math.round((paidPrincipal / a.amount_financed) * 100)}%</div>
                  <div className="text-xs text-muted">principal paid</div>
                </div>
              </div>
            </div>
            <dl className="w-full space-y-3 text-sm">
              <Line2 label="Amount financed" value={money(a.amount_financed)} />
              <Line2 label="Principal paid" value={money(paidPrincipal)} dot={RED} />
              <Line2 label="Principal remaining" value={money(balance)} dot="#d4d4d4" />
              <Line2 label="Interest paid so far" value={`≈ ${money(interestPaid)}`} note="Estimate: scheduled payments minus principal paid" />
              <Line2 label="Interest still to pay" value={money(interestLeft)} note="If every payment is on time" />
              <div>
                <div className="flex justify-between text-xs text-muted">
                  <span>Term</span>
                  <span>{a.months_remaining} months left</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#ececec]">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${(a.months_elapsed / a.term_months) * 100}%` }} />
                </div>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel title="Loan amortization" subtitle={`Principal and interest by year at ${apr}% APR, from today's balance`}>
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={yearly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} width={56} />
                <Tooltip formatter={(n) => usd(Number(n))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="principal" name="Principal" stackId="p" fill={INK} maxBarSize={44} />
                <Bar dataKey="interest" name="Interest" stackId="p" fill={RED} radius={[8, 8, 0, 0]} maxBarSize={44} />
                <Line dataKey="balance" name="Balance at year end" stroke="#8a8f98" strokeWidth={2} dot={false} type="monotone" />
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
        <Panel title="Vehicle equity" subtitle="Estimated value compared with your payoff quote">
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart
                layout="vertical"
                data={[
                  { name: "Estimated value", value: v.est_market_value_now },
                  { name: "Payoff quote", value: payoff },
                ]}
                margin={{ left: 8, right: 24 }}
              >
                <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} />
                <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={110} />
                <Tooltip formatter={(n) => usd(Number(n))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={36}>
                  <Cell fill={INK} />
                  <Cell fill={STEEL} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={cn("mt-3 text-lg font-semibold", equity >= 0 ? "text-go" : "text-signal")}>
            About {money(Math.abs(equity))} {equity >= 0 ? "of estimated equity" : "more owed than the estimated value"}
          </p>
          <p className="mt-1 text-xs text-caution">The vehicle value is an estimate from the account record, not a guaranteed trade-in offer.</p>
        </Panel>

        <Panel title="Upcoming payments" subtitle="Next six scheduled payments, split by principal and interest">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Due</th>
                  <th className="pb-2 text-right font-medium">Payment</th>
                  <th className="pb-2 text-right font-medium">Principal</th>
                  <th className="pb-2 text-right font-medium">Interest</th>
                  <th className="pb-2 text-right font-medium">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={r.month} className={cn("border-t border-line", i === 0 && "font-semibold")}>
                    <td className="py-2.5">{fmtDate(addMonths(due, i))}</td>
                    <td className="py-2.5 text-right">{money(r.principal + r.interest, true)}</td>
                    <td className="py-2.5 text-right">{money(r.principal, true)}</td>
                    <td className="py-2.5 text-right text-signal">{money(r.interest, true)}</td>
                    <td className="py-2.5 text-right text-muted">{money(r.balance)}</td>
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
          <div key={key} className="rounded-2xl border border-line p-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
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
              <CartesianGrid vertical={false} stroke="#ececec" />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={usdShort} width={56} />
              <Tooltip formatter={(n) => usd(Number(n))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
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
            <li className="rounded-2xl bg-sodium/15 p-3">
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
        <Panel title="Lease progress" subtitle={`${a.months_elapsed} of ${a.term_months} months`}>
          <div className="grid grid-cols-12 gap-1" aria-hidden>
            {timeline.map((m) => (
              <span key={m.month} className={cn("h-3 rounded-sm", m.paid ? "bg-ink" : "bg-[#ececec]")} />
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
                    <Tooltip formatter={(n) => `${Number(n).toLocaleString("en-US")} mi`} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
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
                <Tooltip formatter={(n) => usd(Number(n))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
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
    <Panel title="Your next moves" subtitle="NextMove AI works through these for you. Nothing on your agreement changes until you confirm it.">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <AutoNextMoves p={p} />
        <div className="rounded-2xl bg-mist p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-signal" /> Ask Toyota NextMove AI
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {prompts.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-2xl border border-line bg-paper px-4 py-3 text-left text-sm transition-colors hover:border-ink">
                {q}
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
    <label className="block rounded-2xl bg-mist p-4 text-sm">
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