import { useState } from "react";
import type { Profile, YN } from "../data/types";
import { date, miles, money } from "../lib/format";
import { CustomerTalk } from "./CustomerTalk";
import { LifeShift } from "./LifeShift";
import { NextMove } from "./NextMove";
import { OptionsCompare } from "./OptionsCompare";
import { PhoneDesk } from "./PhoneDesk";

const yesNo = (v: YN) => (v === "Y" ? "Yes" : "No");

function sharedNote(shared: { income: string; note: string }) {
  const amount = Number(shared.income.replace(/[$,\s]/g, ""));
  const income = shared.income ? (Number.isFinite(amount) ? money(amount) : shared.income) : "";
  const lead = income ? `You told us your monthly income is now ${income}` : "You told us about a change";
  return shared.note ? `${lead}: “${shared.note}.”` : `${lead}.`;
}

export function AccountPage({ p }: { p: Profile }) {
  const { customer: c, vehicle: v, account: a, situation: s } = p;
  const isLease = a.contract_type === "lease";
  const [toldIncome, setToldIncome] = useState("");
  const [toldNote, setToldNote] = useState("");
  const [shared, setShared] = useState<{ income: string; note: string } | null>(null);

  const vehicleName = `${v.model_year} Toyota ${v.model} ${v.trim}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-10 md:px-8 md:py-14">
      <header>
        <p className="text-sm font-medium text-signal">Your account · {c.customer_id}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Hello, {c.first_name}.</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          {vehicleName} · {isLease ? "Lease" : "Retail installment loan"} with Toyota Financial Services · {money(a.monthly_payment, true)} a month
        </p>
      </header>

      <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">What you told us</h2>
        <blockquote className="mt-4 border-l-4 border-signal pl-4 text-xl leading-snug">“{s.customer_says}”</blockquote>
        <p className="mt-4 text-sm text-muted">{s.context_summary}</p>
        <p className="mt-2 text-xs text-muted">
          Situation {s.situation_id}. This is your statement. It is not independently verified.
        </p>
      </section>

      <NextMove p={p} />

      <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Your Toyota</h2>
        <p className="mt-1 text-sm text-muted">Everything on the vehicle record for {v.vehicle_id}.</p>
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
      </section>

      <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Your financing</h2>
        <p className="mt-1 text-sm text-muted">
          Account {a.account_id}. This contract is with Toyota Financial Services. Programs below apply to this {isLease ? "lease" : "loan"} only.
        </p>
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
      </section>

      <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">About you, on file</h2>
        <p className="mt-1 text-sm text-muted">
          This is the customer record for {c.customer_id}. Income here is what was stored with the account. If it is out of date, tell us below — we will not assume the new number.
        </p>
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
      </section>

      <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Something we don't have yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Share a change only if you want it considered. This does not connect another bank account, and it does not pull a credit report. We will show it back as your statement, unverified.
        </p>
        <form
          className="mt-5 grid gap-4 md:grid-cols-2"
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
              className="mt-2 w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">What changed</span>
            <input
              value={toldNote}
              onChange={(e) => setToldNote(e.target.value)}
              placeholder="Optional"
              className="mt-2 w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-ink"
            />
          </label>
          <div>
            <button type="submit" className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white hover:bg-black">
              Save for this visit
            </button>
          </div>
        </form>
        {shared && (
          <p className="mt-4 rounded-2xl bg-sodium/15 px-4 py-3 text-sm leading-relaxed" role="status">
            {sharedNote(shared)}. Toyota Financial Services has not verified this. It does not change your payment or your eligibility by itself.
          </p>
        )}
      </section>

      <LifeShift p={p} />
      <OptionsCompare p={p} />
      <PhoneDesk p={p} />
      <CustomerTalk p={p} />
    </main>
  );
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="mt-1 font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
