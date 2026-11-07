import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Profile } from "../data/types";
import { money } from "../lib/format";

export function SignInPage({ profiles, onSignIn }: { profiles: Profile[]; onSignIn: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) =>
      [p.customer.first_name, p.customer.city, p.vehicle.model, p.customer.customer_id, p.moment].join(" ").toLowerCase().includes(s)
    );
  }, [q, profiles]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <p className="text-sm font-medium text-signal">Demo sign-in</p>
      <h1 className="mt-2 max-w-[18ch] text-4xl font-semibold tracking-tight md:text-5xl">Choose your Toyota Financial account.</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
        These are fictional customers. Signing in opens only that person's vehicle, contract, and options. You will not see anyone else's account.
      </p>
      <label className="mt-8 flex max-w-md items-center gap-2 rounded-full border border-line bg-paper px-4 py-3">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, city, or model"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <li key={p.customer.customer_id}>
            <button
              onClick={() => onSignIn(p.customer.customer_id)}
              className="flex h-full w-full flex-col rounded-3xl border border-line bg-paper p-5 text-left hover:border-ink"
            >
              <span className="text-lg font-semibold">{p.customer.first_name}</span>
              <span className="mt-1 text-sm text-muted">
                {p.customer.city}, {p.customer.state}
              </span>
              <span className="mt-4 text-sm">
                {p.vehicle.model_year} {p.vehicle.model} {p.vehicle.trim}
              </span>
              <span className="mt-1 text-sm text-muted">
                {p.account.contract_type === "lease" ? "Lease" : "Loan"} · {money(p.account.monthly_payment, true)}/mo
              </span>
              <span className="mt-4 text-sm font-medium text-signal">Continue as {p.customer.first_name}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="mt-8 text-sm text-muted">No demo account matches that search.</p>}
    </main>
  );
}
