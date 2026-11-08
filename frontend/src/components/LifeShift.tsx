import { useEffect, useMemo, useState } from "react";
import { sendChatMessage } from "../api/client";
import type { Profile } from "../data/types";
import { money } from "../lib/format";
import { simulate, type LifeInputs } from "../lib/lifeshift";
import { useAuth } from "../state/auth";

export const LIFE_CHANGE_EXAMPLE =
  "I'm starting a new job, but my monthly expenses are increasing by $400. What should I do about my $580 Toyota payment?";

export function LifeShift({ p }: { p: Profile }) {
  const { account, saveLifeChange } = useAuth();
  const [input, setInput] = useState<LifeInputs>({
    incomePct: 0,
    extraExpenses: 0,
    dailyMiles: Math.round((p.vehicle.annual_miles_est || 0) / 480),
    budget: Math.round(p.account.monthly_payment || 0) || 400,
  });
  const [text, setText] = useState(account?.life_change ?? "");
  const [advice, setAdvice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => simulate(p, input), [p, input]);

  useEffect(() => {
    const story = text.trim();
    if (!story) {
      setAdvice(null);
      setBusy(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void saveLifeChange(story);
      const lines = result.scenarios
        .map((scenario) =>
          scenario.available && scenario.payment != null
            ? `${scenario.title}: ${money(scenario.payment, true)} a month. ${scenario.note}`
            : `${scenario.title}: not available. ${scenario.note}`,
        )
        .join("\n");
      setBusy(true);
      setError(null);
      sendChatMessage(
        [{ role: "user", content: `${story}\n\nVerified choices:\n${lines}\nSuggest a next step from those choices when they exist. Say that what I wrote is unverified.` }],
        p.customer.customer_id,
      )
        .then((reply) => setAdvice(reply))
        .catch(() => {
          setAdvice(null);
          setError("Nemotron isn't available yet. The chart still uses the numbers on your agreement.");
        })
        .finally(() => setBusy(false));
    }, 800);
    return () => window.clearTimeout(handle);
  }, [input.budget, input.dailyMiles, input.extraExpenses, input.incomePct, p.customer.customer_id, result, saveLifeChange, text]);

  const payments = result.scenarios.filter((scenario) => scenario.payment != null) as ((typeof result.scenarios)[number] & { payment: number })[];
  const maxPay = Math.max(...payments.map((scenario) => scenario.payment), 1);

  return (
    <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <p className="text-sm font-medium text-signal">LifeShift</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tell us what changed.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Write it the way you would say it. Nemotron reads that and suggests a next step. What you write is unverified until Toyota confirms it.
      </p>
      <label className="mt-5 block text-sm">
        <span className="font-medium">What changed in your life</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder={LIFE_CHANGE_EXAMPLE} className="field mt-2" />
      </label>
      <p className="mt-2 text-sm text-muted">Example: “{LIFE_CHANGE_EXAMPLE}”</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Slider label="Income change" min={-40} max={40} step={1} value={input.incomePct} suffix="%" onChange={(incomePct) => setInput((c) => ({ ...c, incomePct }))} />
        <Slider label="Extra monthly expenses" min={0} max={1500} step={25} value={input.extraExpenses} display={money(input.extraExpenses)} onChange={(extraExpenses) => setInput((c) => ({ ...c, extraExpenses }))} />
        <Slider label="Daily commute" min={0} max={80} step={1} value={input.dailyMiles} suffix=" mi" onChange={(dailyMiles) => setInput((c) => ({ ...c, dailyMiles }))} />
        <Slider label="Monthly car budget" min={200} max={1200} step={10} value={input.budget} display={money(input.budget)} onChange={(budget) => setInput((c) => ({ ...c, budget }))} />
      </div>
      <div className="mt-6 space-y-4">
        {result.scenarios.map((scenario) => (
          <div key={scenario.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{scenario.title}</span>
              <span>{scenario.payment == null ? "Not on this agreement" : money(scenario.payment, true)}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-daylight">
              {scenario.payment != null && <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(6, (scenario.payment / maxPay) * 100)}%` }} />}
            </div>
            <p className="mt-1 text-xs text-muted">{scenario.note}</p>
          </div>
        ))}
      </div>
      {busy && <p className="mt-4 text-sm text-muted">Nemotron is reading what you told us…</p>}
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
      <input className="mt-2 w-full accent-[#eb0a1e]" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
