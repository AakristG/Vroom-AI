import { useState, type ReactNode } from "react";
import type { Profile, YN } from "../data/types";
import { cn, date, miles, money } from "../lib/format";
import { isNewAccount } from "../lib/sessionProfile";
import { NewAccountView } from "./NewAccountView";
import { AccountHero } from "./AccountHero";
import { NextMove } from "./NextMove";
import { OptionsCompare } from "./OptionsCompare";
import { AppointmentsPanel } from "./AppointmentsPanel";
import { PhoneDesk } from "./PhoneDesk";
import { Reveal } from "./ui/motion";

const yesNo = (v: YN) => (v === "Y" ? "Yes" : "No");

function sharedNote(shared: { income: string; note: string }) {
  const amount = Number(shared.income.replace(/[$,\s]/g, ""));
  const income = shared.income ? (Number.isFinite(amount) ? money(amount) : shared.income) : "";
  const lead = income ? `You told us your monthly income is now ${income}` : "You told us about a change";
  return shared.note ? `${lead}: “${shared.note}.”` : `${lead}.`;
}

export function AccountPage({ p }: { p: Profile }) {
  if (isNewAccount(p)) return <NewAccountView p={p} eyebrow={`Your account · ${p.customer.customer_id}`} />;
  return <AgreementAccount p={p} />;
}

const SECTIONS = [
  ["situation", "Overview"],
  ["vehicle", "Vehicle"],
  ["financing", "Financing"],
  ["profile", "About you"],
  ["options", "Options"],
  ["phone-desk", "AI agent"],
  ["appointments", "Appointments"],
] as const;

function AgreementAccount({ p }: { p: Profile }) {
  const { customer: c, vehicle: v, account: a, situation: s } = p;
  const isLease = a.contract_type === "lease";
  const [toldIncome, setToldIncome] = useState("");
  const [toldNote, setToldNote] = useState("");
  const [shared, setShared] = useState<{ income: string; note: string } | null>(null);

  const vehicleName = `${v.model_year} Toyota ${v.model} ${v.trim}`;

  return (
    <>
      <AccountHero
        p={p}
        eyebrow={`Your account · ${c.customer_id}`}
        title={`Hello, ${c.first_name}.`}
        stats={[
          ["Vehicle", `${v.model_year} ${v.model} ${v.trim}`],
          ["Monthly payment", money(a.monthly_payment, true)],
          [isLease ? "Lease ends" : "Loan ends", date(a.contract_end)],
          ["Odometer", miles(v.odometer_now)],
        ]}
      >
        {vehicleName} · {isLease ? "Lease" : "Retail installment loan"} with Toyota Financial Services
      </AccountHero>

      <main className="mx-auto max-w-7xl space-y-6 px-5 pb-14 pt-6 md:px-8 md:pb-20">
        <SectionNav />

        <div id="situation" className="-mt-2 scroll-mt-36" />
        <Reveal>
          <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-charcoal-2 to-charcoal p-6 text-white md:p-8">
            <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-signal/25 blur-[90px]" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-signal">What you told us</p>
            <blockquote className="relative mt-4 max-w-3xl border-l-2 border-signal pl-5 text-xl leading-snug md:text-2xl">“{s.customer_says}”</blockquote>
            <p className="relative mt-4 max-w-3xl leading-relaxed text-white/70">{s.context_summary}</p>
            <p className="relative mt-3 text-xs text-white/45">Situation {s.situation_id}. This is your statement. It is not independently verified.</p>
          </div>
        </Reveal>

        <NextMove p={p} />

        <SectionLabel>Your agreement</SectionLabel>

        <Panel id="vehicle" title="Your Toyota" subtitle={`Everything on the vehicle record for ${v.vehicle_id}`}>
          <FieldGrid
            rows={[
              ["Vehicle ID", v.vehicle_id],
              ["Model year", String(v.model_year)],
              ["Model", v.model],
              ["Trim", v.trim],
              ["Condition when you got it", v.condition_at_purchase],
              ["Price when you got it", money(v.purchase_price_or_msrp)],
              ["Odometer", miles(v.odometer_now)],
              ["Estimated miles per year", miles(v.annual_miles_est)],
              ["Estimated value today", money(v.est_market_value_now)],
              ["ToyotaCare ends", date(v.toyota_care_ends)],
              ["Basic warranty ends", date(v.basic_warranty_ends)],
              ["Last service", date(v.last_service_date)],
              ["Next service due", date(v.next_service_due)],
              ["Open recall", yesNo(v.open_recall)],
            ]}
          />
          <p className="mt-4 text-xs text-caution">Vehicle value is an estimate, not a guaranteed trade-in offer.</p>
        </Panel>

        <Panel
          id="financing"
          title="Your financing"
          subtitle={`Account ${a.account_id} with Toyota Financial Services. Programs below apply to this ${isLease ? "lease" : "loan"} only.`}
        >
          <div className="mb-5">
            <div className="flex justify-between text-xs text-muted">
              <span>
                {a.months_elapsed} of {a.term_months} months
              </span>
              <span>{a.months_remaining} months left</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ececec]">
              <div className="h-full rounded-full bg-gradient-to-r from-ink to-steel" style={{ width: `${Math.min(a.months_elapsed / a.term_months, 1) * 100}%` }} />
            </div>
          </div>
          <FieldGrid
            rows={[
              ["Contract type", isLease ? "Lease" : "Loan"],
              ["Started", date(a.contract_start)],
              ["Ends", date(a.contract_end)],
              ["Term", `${a.term_months} months`],
              ["Months elapsed", String(a.months_elapsed)],
              ["Months remaining", String(a.months_remaining)],
              ["Amount financed", money(a.amount_financed)],
              ["Monthly payment", money(a.monthly_payment, true)],
              ["APR", a.apr == null ? "Not on this agreement" : `${a.apr}%`],
              ["Money factor", a.money_factor == null ? "Not on this agreement" : a.money_factor.toFixed(5)],
              ["Current balance", money(a.current_balance)],
              ["Payoff quote", money(a.payoff_quote)],
              ["Residual value", money(a.residual_value)],
              ["Mileage allowance", a.mileage_allowance_total == null ? "Not on this agreement" : miles(a.mileage_allowance_total)],
              ["Estimated equity", money(a.est_equity)],
              ["Payment due day", `Day ${a.payment_due_day}`],
              ["Autopay", yesNo(a.autopay)],
              ["Missed payments, last 12 months", String(a.missed_payments_12m)],
            ]}
          />
        </Panel>

        <SectionLabel align="right">About you</SectionLabel>

        <Panel
          id="profile"
          title="About you, on file"
          subtitle={`The customer record for ${c.customer_id}. Income here is what was stored with the account. If it is out of date, tell us below — we will not assume the new number.`}
        >
          <FieldGrid
            rows={[
              ["Name", c.first_name],
              ["Age", String(c.age)],
              ["City", c.city],
              ["State", c.state],
              ["Occupation", c.occupation],
              ["Annual income on file", money(c.annual_income)],
              ["Other monthly debt on file", money(c.other_monthly_debt)],
              ["Credit tier at the start", `Tier ${c.credit_tier_at_origination}`],
              ["Credit tier now", `Tier ${c.credit_tier_now}`],
              ["Time with Toyota Financial", `${c.tenure_months_with_tfs} months`],
              ["Autopay preference", yesNo(c.autopay)],
              ["How you usually reach us", c.preferred_channel],
              ["App and site use", c.digital_engagement],
              ["Marketing permission", yesNo(c.marketing_consent)],
              ["Payday", `Day ${c.payday_day}`],
              ["Payment as % of income", `${c.payment_to_income_pct}%`],
              ["Debt as % of income", `${c.debt_to_income_pct}%`],
              ["Financial stress score", String(c.financial_stress_score)],
              ["Needs a person to review hardship", yesNo(c.vulnerable_flag)],
            ]}
          />
        </Panel>

        <Panel
          title="Something we don't have yet"
          subtitle="Share a change only if you want it considered. This does not connect another bank account, and it does not pull a credit report. We will show it back as your statement, unverified."
        >
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setShared({ income: toldIncome.trim(), note: toldNote.trim() });
            }}
          >
            <label className="block text-sm">
              <span className="font-medium">Monthly income now, if it changed</span>
              <input
                inputMode="decimal"
                value={toldIncome}
                onChange={(e) => setToldIncome(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full rounded-md border border-line bg-mist px-4 py-3 outline-none transition-colors focus:border-ink focus:bg-paper"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">What changed</span>
              <input
                value={toldNote}
                onChange={(e) => setToldNote(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full rounded-md border border-line bg-mist px-4 py-3 outline-none transition-colors focus:border-ink focus:bg-paper"
              />
            </label>
            <button type="submit" className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white hover:bg-black">
              Save for this visit
            </button>
          </form>
          {shared && (
            <p className="mt-4 rounded-md bg-sodium/15 px-4 py-3 text-sm leading-relaxed" role="status">
              {sharedNote(shared)}. Toyota Financial Services has not verified this. It does not change your payment or your eligibility by itself.
            </p>
          )}
        </Panel>

        <SectionLabel>Your options and help</SectionLabel>

        <div id="options" className="scroll-mt-36">
          <OptionsCompare p={p} />
        </div>
        <PhoneDesk p={p} />
        <AppointmentsPanel />
      </main>
    </>
  );
}

function SectionNav() {
  return (
    <nav aria-label="My Toyota sections" className="sticky top-16 z-20 -mx-5 overflow-x-auto px-5 py-2 md:top-[72px] md:-mx-8 md:px-8">
      <div className="inline-flex gap-1 rounded-full border border-black/[0.06] bg-paper/85 p-1 shadow-[var(--shadow-soft)] backdrop-blur">
        {SECTIONS.map(([id, label]) => (
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

function Panel({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Reveal as="section" className="card scroll-mt-36 overflow-hidden rounded-md">
      <div id={id} className="scroll-mt-36" />
      <div className="border-b border-line px-6 pb-4 pt-6 md:px-7 md:pt-7">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="p-6 md:p-7">{children}</div>
    </Reveal>
  );
}


function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md bg-mist px-4 py-3">
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
