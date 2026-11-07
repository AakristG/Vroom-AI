import { profiles, valueDrivers, type NextStepType } from "../data/types";
import { money } from "../lib/format";

const order: NextStepType[] = ["Self-service", "Follow-up", "Offer"];
const colors: Record<NextStepType, string> = { "Self-service": "bg-go", "Follow-up": "bg-sodium", Offer: "bg-signal" };
const labels: Record<NextStepType, string> = { "Self-service": "Self-service", "Follow-up": "Specialist follow-up", Offer: "Eligible offer" };

export function ValueStrip() {
  const total = profiles.reduce((s, p) => s + p.golden.expected_value_usd, 0);
  const counts = order.map((t) => ({ t, n: profiles.filter((p) => p.golden.next_step_type === t).length }));
  const human = profiles.filter((p) => p.customer.vulnerable_flag === "Y" || p.account.missed_payments_12m >= 2).length;
  const noOffer = profiles.filter((p) => p.golden.next_step_type !== "Offer").length;
  const call = valueDrivers.find((d) => d.driver_id === "VD_CALL");

  return (
    <section id="value" className="mx-auto max-w-7xl px-5 py-24 md:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-end">
        <div>
          <h2 className="font-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.9] tracking-wide">What it's worth to Toyota</h2>
          <p className="mt-4 max-w-[52ch] text-lg text-muted">
            Across the 20 synthetic customers, the recommended moves add up to{" "}
            <strong className="text-ink">{money(total)}</strong> in expected value (value if completed × assumed take rate). And{" "}
            {noOffer} of 20 callers are steered to something other than a sales offer.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-6">
          <div className="text-sm text-muted">Where 20 callers end up</div>
          <div className="mt-3 flex h-10 overflow-hidden rounded-lg" role="img" aria-label={counts.map((c) => `${labels[c.t]}: ${c.n}`).join(", ")}>
            {counts.map((c) => (
              <div key={c.t} className={`${colors[c.t]} flex items-center justify-center text-sm font-semibold text-white`} style={{ width: `${(c.n / 20) * 100}%` }}>
                {c.n}
              </div>
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {counts.map((c) => (
              <li key={c.t} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm ${colors[c.t]}`} /> {labels[c.t]}
              </li>
            ))}
          </ul>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="text-muted">Handed to a person, no pitch</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{human} callers</dd>
            </div>
            <div>
              <dt className="text-muted">Each avoided contact-center call</dt>
              <dd className="mt-0.5 text-2xl font-semibold">{call ? money(Number(call.value_usd), true) : "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-caution">All dollar values are synthetic assumptions from value_drivers.csv.</p>
        </div>
      </div>
    </section>
  );
}
