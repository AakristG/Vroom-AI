import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { Profile } from "../data/types";
import { cn, date, guardrails, miles, money } from "../lib/format";

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
      {note && <dd className="text-xs text-caution">{note}</dd>}
    </div>
  );
}

export function AccountSummary({ p }: { p: Profile }) {
  const { customer: c, vehicle: v, account: a } = p;
  const isLease = a.contract_type === "lease";
  const flags = guardrails(p);
  const tierMoved = c.credit_tier_now !== c.credit_tier_at_origination;

  return (
    <section className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-5xl leading-none tracking-wide">
            {c.first_name}
            <span className="ml-3 inline-block align-middle font-sans text-base font-normal tracking-normal text-muted">
              {c.age}, {c.city} TX — {c.occupation}
            </span>
          </h2>
          <p className="mt-2 text-muted">
            {v.model_year} Toyota {v.model} {v.trim} · {isLease ? "Lease" : "Loan"} with TFS for {c.tenure_months_with_tfs}{" "}
            months · prefers {c.preferred_channel.toLowerCase()}
          </p>
        </div>
      </div>

      <blockquote className="mt-5 border-l-4 border-signal pl-4 text-xl leading-snug">“{p.situation.customer_says}”</blockquote>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
        <Fact label="Monthly payment" value={money(a.monthly_payment, true)} />
        <Fact label="Months left" value={`${a.months_remaining} of ${a.term_months}`} />
        {isLease ? (
          <Fact label="Residual" value={money(a.residual_value)} />
        ) : (
          <Fact label="Balance" value={money(a.current_balance)} />
        )}
        {isLease ? (
          <Fact label="Money factor" value={a.money_factor?.toFixed(5) ?? "—"} />
        ) : (
          <Fact label="APR" value={`${a.apr}%`} />
        )}
        <Fact label="Car's value" value={money(v.est_market_value_now)} note="Estimate" />
        <Fact
          label="Equity"
          value={money(a.est_equity)}
          note={a.est_equity != null && a.est_equity < 0 ? "Owes more than it's worth" : "Estimate"}
        />
        <Fact label="Odometer" value={miles(v.odometer_now)} />
        <Fact label="Credit tier" value={tierMoved ? `${c.credit_tier_at_origination} → ${c.credit_tier_now}` : c.credit_tier_now} />
        <Fact label="Payment to income" value={`${c.payment_to_income_pct}%`} />
        <Fact label="Missed (12 mo)" value={String(a.missed_payments_12m)} />
        <Fact label="Due day / payday" value={`${a.payment_due_day} / ${c.payday_day}`} />
        <Fact label="Contract ends" value={date(a.contract_end)} />
      </dl>

      {flags.length > 0 && (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {flags.map((f) => {
            const Icon = f.tone === "stop" ? OctagonAlert : f.tone === "caution" ? AlertTriangle : Info;
            return (
              <li
                key={f.id}
                className={cn(
                  "flex gap-3 rounded-xl p-3 text-sm",
                  f.tone === "stop" && "bg-signal/8 text-signal-deep",
                  f.tone === "caution" && "bg-sodium/15 text-caution",
                  f.tone === "info" && "bg-daylight text-muted"
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="font-semibold">{f.title}.</strong> {f.body}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
