import { ArrowRight, Car, ClipboardList, MessageSquareText, Pencil, Scale, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { hasAgreement } from "../api/client";
import type { Profile } from "../data/types";
import { addMonths, byYear, nextDueDate, schedule } from "../lib/finance";
import { cn, money } from "../lib/format";
import { useAssistant } from "../state/assistant";
import { useAuth } from "../state/auth";
import { AccountHero } from "./AccountHero";
import { AgreementForm } from "./AgreementForm";
import { LoanSimulator } from "./insights/LoanSimulator";
import { Reveal } from "./ui/motion";

const RED = "#eb0a1e";
const INK = "#16171a";
const axis = { fontSize: 12, fill: "#5e5e5e" };
const usd = (n: number) => money(Math.round(n));
const usdShort = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
const dayMonthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Account view for someone who signed up on the site. Nothing comes from a Toyota Financial agreement:
 * figures are computed only from terms the customer typed, and are labeled that way.
 */
export function NewAccountView({ p, eyebrow }: { p: Profile; eyebrow: string }) {
  const { account } = useAuth();
  const { ask, setOpen } = useAssistant();
  const [editing, setEditing] = useState(false);
  const { customer: c, vehicle: v, account: a, situation: s } = p;
  const entered = hasAgreement(account?.agreement);
  const isLoan = entered && a.contract_type === "loan" && a.current_balance != null && a.apr != null;
  const due = nextDueDate(a.payment_due_day);
  const end = a.months_remaining > 0 ? addMonths(due, a.months_remaining - 1) : null;
  const vehicle = v.model ? `${account?.vehicle_year ?? ""} Toyota ${v.model}`.trim() : "Not provided";
  const paymentText = a.monthly_payment > 0 ? money(a.monthly_payment, true) : "Not provided";

  const stats: [string, string][] = !entered
    ? [
        ["Your Toyota", vehicle],
        ["Monthly payment you entered", paymentText],
        ["Location", [c.city, c.state].filter(Boolean).join(", ") || "Not provided"],
        ["Loan or lease details", "Not added yet"],
      ]
    : isLoan
      ? [
          ["Your Toyota", vehicle],
          ["Monthly payment", paymentText],
          ["Loan balance", money(a.current_balance)],
          ["Paid off around", end ? monthYear(end) : "—"],
        ]
      : [
          ["Your Toyota", vehicle],
          ["Monthly payment", paymentText],
          ["Months left", String(a.months_remaining)],
          ["Lease ends around", end ? monthYear(end) : "—"],
        ];

  return (
    <main className="pb-24">
      <AccountHero p={p} eyebrow={eyebrow} title={`Hello, ${c.first_name}.`} badge={entered ? "Based on numbers you entered" : "Self-reported details"} stats={stats}>
        {entered
          ? `${isLoan ? `Auto loan at ${a.apr}% APR` : "Lease"}, as you described it. Not checked against your agreement.`
          : "Welcome. Your account is set up with the details you gave us."}
      </AccountHero>

      <div className="mx-auto max-w-6xl space-y-6 px-5 pt-8 md:px-8">
        {!entered || editing ? (
          <Reveal className="card overflow-hidden p-0">
            <div className="grid md:grid-cols-[0.8fr_1.2fr]">
              <div className="border-b border-line bg-mist p-6 md:border-b-0 md:border-r md:p-8">
                <ClipboardList className="h-6 w-6 text-signal" />
                <h2 className="mt-4 text-2xl font-semibold tracking-tight">{entered ? "Update your loan or lease details" : "Add your loan or lease details"}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Your sign-in isn't linked to a Toyota Financial Services agreement, so we can't look these up. Type them in and this page fills with your
                  payoff timeline, interest, and a what-if simulator.
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {["Takes about a minute", "Saved to your account, editable anytime", "Never used to approve or decline anything"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-go" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-6 md:p-8">
                <AgreementForm
                  onDone={() => {
                    setEditing(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onCancel={entered ? () => setEditing(false) : undefined}
                />
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-caution/30 bg-caution/5 px-5 py-4 md:px-6">
            <p className="flex items-start gap-2 text-sm leading-relaxed">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
              <span>
                <strong className="font-semibold">Estimates from the numbers you entered.</strong>{" "}
                <span className="text-muted">They aren't checked against your agreement, and they aren't an offer or an approval.</span>
              </span>
            </p>
            <button onClick={() => setEditing(true)} className="btn-ghost shrink-0">
              <Pencil className="h-4 w-4" /> Edit details
            </button>
          </Reveal>
        )}

        {entered && !editing && (isLoan ? <LoanView p={p} /> : <LeaseView p={p} end={end} />)}

        <Reveal className="card p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">What you told us</h2>
          {s.customer_says ? (
            <blockquote className="mt-4 border-l-4 border-signal pl-4 text-xl leading-snug">“{s.customer_says}”</blockquote>
          ) : (
            <p className="mt-3 text-muted">Nothing yet.</p>
          )}
          <p className="mt-4 text-sm text-muted">Toyota Financial Services has not verified this. The assistant uses it as context, not as fact.</p>
          <button
            onClick={() => ask(s.customer_says ? `Here's what changed for me: ${s.customer_says} What should I think about first?` : "What can you help me with?")}
            className="btn-primary mt-6"
          >
            Talk this through with Toyota AI <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-3">
          <Action to="/vehicles" icon={Car} title="Explore vehicles" body="Browse the Toyota lineup with real specs." />
          <Action to="/compare" icon={Scale} title="Compare models" body="Side-by-side specs and fuel-cost estimates." />
          <button onClick={() => setOpen(true)} className="card card-hover p-6 text-left">
            <MessageSquareText className="h-5 w-5 text-signal" />
            <h3 className="mt-3 font-semibold">Ask Toyota Vroom AI</h3>
            <p className="mt-1 text-sm text-muted">{entered ? "It can explain these numbers in plain language." : "General loan and lease questions, in plain language."}</p>
          </button>
        </div>
      </div>
    </main>
  );
}

function LoanView({ p }: { p: Profile }) {
  const a = p.account;
  const balance = a.current_balance!;
  const apr = a.apr!;
  const rows = useMemo(() => schedule(balance, apr, a.monthly_payment), [balance, apr, a.monthly_payment]);
  const interestLeft = rows.reduce((sum, r) => sum + r.interest, 0);
  const yearly = byYear(rows);
  const due = nextDueDate(a.payment_due_day);
  const first = rows[0];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Interest left to pay" value={usd(interestLeft)} note="If every payment is on time" />
        <Figure label="Payments left" value={String(rows.length)} note={`Last one around ${monthYear(addMonths(due, rows.length - 1))}`} />
        <Figure
          label="Next payment"
          value={money(a.monthly_payment, true)}
          note={first ? `${money(first.interest, true)} interest · ${money(first.principal, true)} principal` : undefined}
        />
      </div>

      <Panel title="Where your payments go" subtitle={`Principal and interest by year at ${apr}% APR, from the balance you entered`}>
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

      <div id="scenarios" className="scroll-mt-28" />
      <Reveal>
        <LoanSimulator p={p} selfReported />
      </Reveal>

      <Panel title="Upcoming payments" subtitle="Next six payments, split by principal and interest">
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
                  <td className="py-2.5">{dayMonthYear(addMonths(due, i))}</td>
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
    </>
  );
}

function LeaseView({ p, end }: { p: Profile; end: Date | null }) {
  const a = p.account;
  const odometer = p.vehicle.odometer_now;
  const allowance = a.mileage_allowance_total;
  const milesLeft = allowance != null && odometer > 0 ? allowance - odometer : null;
  const perMonth = milesLeft != null && a.months_remaining > 0 ? Math.round(milesLeft / a.months_remaining) : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Payments left" value={usd(a.months_remaining * a.monthly_payment)} note={`${a.months_remaining} × ${money(a.monthly_payment, true)}`} />
        <Figure label="Lease ends around" value={end ? monthYear(end) : "—"} note="Counted from your next due date" />
        <Figure
          label="Residual (buyout) value"
          value={a.residual_value != null ? money(a.residual_value) : "Not entered"}
          note={a.residual_value != null ? "Before fees and taxes" : "Add it to compare buying vs. returning"}
        />
      </div>

      <Panel id="scenarios" title="Mileage" subtitle="From the allowance and odometer reading you entered">
        {milesLeft != null ? (
          <>
            <p className={cn("text-2xl font-semibold", milesLeft >= 0 ? "text-go" : "text-signal")}>
              {milesLeft >= 0
                ? `${milesLeft.toLocaleString("en-US")} miles left in your allowance`
                : `${Math.abs(milesLeft).toLocaleString("en-US")} miles over your allowance already`}
            </p>
            {perMonth != null && milesLeft >= 0 && (
              <p className="mt-2 text-sm text-muted">That's about {perMonth.toLocaleString("en-US")} miles a month until the lease ends.</p>
            )}
            <p className="mt-3 text-xs text-muted">Any excess-mileage charge is set by your lease agreement.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Add your total mileage allowance and today's odometer reading to see how many miles you have left.</p>
        )}
      </Panel>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Reveal className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Reveal>
  );
}

function Panel({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Reveal className="card p-6 md:p-8">
      {id && <div id={id} className="scroll-mt-28" />}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </Reveal>
  );
}

function Action({ to, icon: Icon, title, body }: { to: string; icon: typeof Car; title: string; body: string }) {
  return (
    <Link to={to} className="card card-hover p-6">
      <Icon className="h-5 w-5 text-signal" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </Link>
  );
}
