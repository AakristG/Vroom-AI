import { useMemo, useState } from "react";
import { sendChatMessage } from "../api/client";
import type { Profile } from "../data/types";
import { lifeEvents, simulate, type LifeInputs } from "../lib/lifeshift";
import { money } from "../lib/format";

export function LifeShift({ p }: { p: Profile }) {
  const [input, setInput] = useState<LifeInputs>({
    incomePct: 0,
    extraExpenses: 0,
    dailyMiles: Math.round(p.vehicle.annual_miles_est / 480),
    budget: Math.round(p.account.monthly_payment),
  });
  const [advice, setAdvice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => simulate(p, input), [p, input]);
  const canOfferTundra = p.customer.marketing_consent === "Y";

  function patch(next: Partial<LifeInputs>) {
    setInput((current) => ({ ...current, ...next }));
    setAdvice(null);
  }

  async function askNemotron() {
    setBusy(true);
    setError(null);
    const lines = result.scenarios
      .map((scenario) =>
        scenario.available && scenario.payment != null
          ? `${scenario.title}: ${money(scenario.payment, true)} a month. ${scenario.note}`
          : `${scenario.title}: not available. ${scenario.note}`
      )
      .join("\n");
    const question = [
      `My life changed. Income is now about ${money(result.income)} a month after a ${input.incomePct}% change.`,
      `Extra monthly expenses: ${money(input.extraExpenses)}. Daily commute: ${input.dailyMiles} miles.`,
      `Car budget I set: ${money(input.budget)}.`,
      `Trade-in estimate already on my account: ${money(result.tradeIn)}. Equity: ${money(result.equity)}. That estimate is not a guaranteed offer.`,
      `Verified choices:\n${lines}`,
      canOfferTundra
        ? "If a different Toyota is allowed, you may mention a Tundra only as something I could ask a dealer to quote. Do not invent its price or payment."
        : "I have not given marketing consent. Do not offer me a new vehicle.",
      "Choose among the verified choices only. Say which one fits, what it costs, and that nothing changes until I authorize it.",
    ].join("\n");
    try {
      const reply = await sendChatMessage([{ role: "user", content: question }], p.customer.customer_id);
      setAdvice(reply);
    } catch {
      setError("Nemotron isn't available. The chart is still calculated from your agreement and these sliders.");
    } finally {
      setBusy(false);
    }
  }

  const payments = result.scenarios.filter((scenario) => scenario.payment != null) as ((typeof result.scenarios)[number] & { payment: number })[];
  const maxPay = Math.max(...payments.map((scenario) => scenario.payment), 1);

  return (
    <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <p className="text-sm font-medium text-signal">LifeShift</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Your life changed. Let's look at the plan.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Move the sliders to describe what changed. Payments come from your agreement when that option is eligible. A lower budget is only an illustration until Toyota prices a real vehicle.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {lifeEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => patch(event.patch)}
            className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink"
          >
            {event.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Slider label="Income change" min={-40} max={40} step={1} value={input.incomePct} suffix="%" onChange={(incomePct) => patch({ incomePct })} />
        <Slider label="Extra monthly expenses" min={0} max={1500} step={25} value={input.extraExpenses} suffix="" display={money(input.extraExpenses)} onChange={(extraExpenses) => patch({ extraExpenses })} />
        <Slider label="Daily commute" min={0} max={80} step={1} value={input.dailyMiles} suffix=" mi" onChange={(dailyMiles) => patch({ dailyMiles })} />
        <Slider label="Monthly car budget" min={200} max={1200} step={10} value={input.budget} display={money(input.budget)} onChange={(budget) => patch({ budget })} />
      </div>

      <p className="mt-4 text-sm text-muted">
        About {money(result.income)} a month before the car. Commute pace is about {result.milesNow.toLocaleString("en-US")} miles a year, versus {p.vehicle.annual_miles_est.toLocaleString("en-US")} on file.
      </p>

      <div className="mt-6" role="img" aria-label={payments.map((scenario) => `${scenario.title} ${money(scenario.payment)}`).join(", ")}>
        <h3 className="text-sm font-semibold">Monthly payment</h3>
        <div className="mt-3 space-y-4">
          {result.scenarios.map((scenario) => (
            <div key={scenario.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{scenario.title}</span>
                <span>{scenario.payment == null ? "Not on this agreement" : money(scenario.payment, true)}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-daylight">
                {scenario.payment != null && (
                  <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(6, (scenario.payment / maxPay) * 100)}%` }} />
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {scenario.note}
                {scenario.leftover != null && ` About ${money(scenario.leftover)} left after debt, extra expenses, and this payment.`}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Account trade-in estimate" value={money(result.tradeIn)} note="Not a guaranteed offer" />
        <Stat label="Equity on file" value={money(result.equity)} note={result.equity != null && result.equity < 0 ? "Owes more than the estimate" : "Estimate"} />
        <Stat label="Tundra" value={canOfferTundra ? "Ask for a quote" : "Not offered"} note={canOfferTundra ? "Nemotron can discuss it. It cannot price it." : "Marketing consent is off."} />
      </div>

      <button
        type="button"
        onClick={askNemotron}
        disabled={busy}
        className="mt-6 rounded-full bg-signal px-5 py-3 text-sm font-medium text-white hover:bg-signal-deep disabled:opacity-50"
      >
        {busy ? "Asking Nemotron…" : "Let Nemotron suggest a next step"}
      </button>
      {error && <p className="mt-3 text-sm text-signal">{error}</p>}
      {advice && <p className="mt-4 rounded-2xl bg-daylight p-4 text-sm leading-relaxed">{advice}</p>}
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix = "",
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  display?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between gap-3 font-medium">
        {label}
        <span>{display ?? `${value}${suffix}`}</span>
      </span>
      <input
        className="mt-2 w-full accent-[#eb0a1e]"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-daylight p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted">{note}</div>
    </div>
  );
}
