import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Profile } from "../data/types";
import { cn, stressLabel } from "../lib/format";

export function CustomerRail({
  profiles,
  selected,
  onSelect,
}: {
  profiles: Profile[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) =>
      [p.customer.first_name, p.vehicle.model, p.moment, p.customer.city, p.customer.customer_id]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [q, profiles]);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-line bg-paper lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
      <div className="border-b border-line p-4">
        <h2 className="font-display text-2xl tracking-wide">Callers</h2>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm focus-within:border-ink">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, model, or situation"
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2 max-lg:flex max-lg:gap-2 max-lg:overflow-x-auto">
        {list.map((p) => {
          const active = p.customer.customer_id === selected;
          const s = stressLabel(p.customer.financial_stress_score);
          return (
            <li key={p.customer.customer_id} className="max-lg:min-w-[15rem]">
              <button
                onClick={() => onSelect(p.customer.customer_id)}
                aria-current={active}
                className={cn(
                  "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                  active ? "bg-night text-white" : "hover:bg-daylight"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.customer.first_name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>
                    {s.label} stress
                  </span>
                </div>
                <div className={cn("mt-0.5 text-sm", active ? "text-white/70" : "text-muted")}>
                  {p.moment} — {p.vehicle.model}
                </div>
              </button>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="p-4 text-sm text-muted">No callers match “{q}”. Try a model like Camry or a word like lease.</li>
        )}
      </ul>
    </aside>
  );
}
