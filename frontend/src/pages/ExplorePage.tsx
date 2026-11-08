import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  apiErrorMessage,
  getCatalog,
  getCatalogStatus,
  getTrims,
  getVehicle,
  getYears,
  vehiclePath,
  type CatalogStatus,
  type DataSource,
  type VehicleRecord,
} from "../api/vehicles";
import { CompareTray } from "../components/vehicles/CompareTray";
import { VehicleCard } from "../components/vehicles/VehicleCard";
import { SignInGate } from "../components/SignInGate";
import { EmptyState, ErrorState, PageIntro, Skeleton, SourceBanner } from "../components/ui/kit";
import { Stagger, StaggerItem } from "../components/ui/motion";
import { cn, money } from "../lib/format";
import { efficiencyScore } from "../lib/spec";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

const SORTS = {
  model: { label: "Model A–Z", fn: (a: VehicleRecord, b: VehicleRecord) => a.model.localeCompare(b.model) },
  hp: { label: "Horsepower: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (b.horsepower ?? -1) - (a.horsepower ?? -1) },
  efficiency: { label: "Efficiency: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (efficiencyScore(b) ?? -1) - (efficiencyScore(a) ?? -1) },
  price: {
    label: "Price: low to high",
    fn: (a: VehicleRecord, b: VehicleRecord) => (a.msrp.value ?? Infinity) - (b.msrp.value ?? Infinity),
  },
  priceDesc: {
    label: "Price: high to low",
    fn: (a: VehicleRecord, b: VehicleRecord) => (b.msrp.value ?? -1) - (a.msrp.value ?? -1),
  },
  seats: { label: "Seats: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (b.seating ?? -1) - (a.seating ?? -1) },
} as const;
type SortKey = keyof typeof SORTS;

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T; source: DataSource; fallback: string | null };

export function ExplorePage() {
  const { profile, account, ready } = useAuth();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [catalog, setCatalog] = useState<Load<VehicleRecord[]>>({ state: "loading" });
  const [trimCards, setTrimCards] = useState<Load<VehicleRecord[]> | null>(null);
  const [reload, setReload] = useState(0);

  const preferredYear = years.includes(2026) ? 2026 : years[0] || 0;
  const year = Number(params.get("year")) || preferredYear;
  const model = params.get("model") ?? "";
  const category = params.get("category") ?? "";
  const seats = params.get("seats") ?? "";
  const fuel = params.get("fuel") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const sort = (params.get("sort") as SortKey) in SORTS ? (params.get("sort") as SortKey) : "model";

  const set = useCallback(
    (key: string, value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          if (key === "year") next.delete("model");
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  usePageContext("explore");

  useEffect(() => {
    getCatalogStatus().then(setStatus).catch(() => undefined);
    getYears()
      .then((r) => setYears(r.data))
      .catch((err) => setCatalog({ state: "error", message: apiErrorMessage(err, "The vehicle service is not reachable.") }));
  }, [reload]);

  useEffect(() => {
    if (!year) return;
    let live = true;
    setCatalog({ state: "loading" });
    getCatalog(year)
      .then((r) => live && setCatalog({ state: "ready", data: r.data, source: r.source, fallback: r.fallback_reason }))
      .catch((err) => live && setCatalog({ state: "error", message: apiErrorMessage(err, "We couldn't load the catalog.") }));
    return () => {
      live = false;
    };
  }, [year, reload]);

  // A specific model shows one card per trim.
  useEffect(() => {
    if (!year || !model) {
      setTrimCards(null);
      return;
    }
    let live = true;
    setTrimCards({ state: "loading" });
    getTrims(year, model)
      .then(async (r) => {
        const trims = r.data.length ? r.data : [null];
        const records = await Promise.all(trims.map((t) => getVehicle(year, model, t).catch(() => null)));
        if (live)
          setTrimCards({ state: "ready", data: records.filter(Boolean) as VehicleRecord[], source: r.source, fallback: r.fallback_reason });
      })
      .catch((err) => live && setTrimCards({ state: "error", message: apiErrorMessage(err, "We couldn't load trims for that model.") }));
    return () => {
      live = false;
    };
  }, [year, model]);

  const active = trimCards ?? catalog;
  const models = catalog.state === "ready" ? [...new Set(catalog.data.map((v) => v.model))].sort() : [];

  const shown = useMemo(() => {
    if (active.state !== "ready") return [];
    const needle = q.trim().toLowerCase();
    return active.data
      .filter((v) => !category || v.category === category)
      .filter((v) => !seats || String(v.seating ?? "") === seats)
      .filter((v) => !fuel || v.fuel_type === fuel)
      .filter((v) => !needle || `${v.model} ${v.trim ?? ""} ${v.category}`.toLowerCase().includes(needle))
      .sort(SORTS[sort].fn);
  }, [active, category, fuel, q, seats, sort]);

  const pageCount = Math.max(1, Math.ceil(shown.length / 9));
  const safePage = Math.min(page, pageCount);
  const pageItems = shown.slice((safePage - 1) * 9, safePage * 9);
  const recommendations = useMemo(() => recommend(catalog.state === "ready" ? catalog.data : [], account?.life_change ?? ""), [account?.life_change, catalog]);

  const categories = status?.categories ?? [];
  const fuels = status?.fuel_types ?? [];
  const seatOptions = ["2", "4", "5", "7", "8"];

  if (!ready) return <main className="min-h-[50vh] pt-32" />;
  if (!profile) return <SignInGate next="/vehicles" title="Sign in to see Toyota models." />;

  return (
    <main className="pb-28">
      <PageIntro eyebrow="Explore Toyota vehicles" title="Find the Toyota that fits your life.">
        Browse every model and trim we have data for. Specs are shown only when the source supplies them.
      </PageIntro>

      <div className="sticky top-16 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl md:top-[72px]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] md:gap-3 md:px-8 md:py-3 xl:overflow-visible [&>*]:shrink-0">
          <label className="relative min-w-[13rem] flex-1">
            <span className="sr-only">Search models</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => set("q", e.target.value)} placeholder="Search models" className="field rounded-full py-2.5 pl-10" />
          </label>
          <Select label="Model year" value={String(year || "")} onChange={(v) => set("year", v)} options={years.map((y) => [String(y), String(y)])} />
          <Select label="Model" value={model} onChange={(v) => set("model", v)} options={[["", "All models"], ...models.map((m) => [m, m] as [string, string])]} />
          <Select label="Fuel type" value={fuel} onChange={(v) => set("fuel", v)} options={[["", "Any fuel"], ...fuels.map((f) => [f, f] as [string, string])]} />
          <Select label="Seats" value={seats} onChange={(v) => set("seats", v)} options={[["", "Any seats"], ...seatOptions.map((n) => [n, `${n} seats`] as [string, string])]} />
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => set("sort", v)}
            options={Object.entries(SORTS).map(([k, s]) => [k, s.label] as [string, string])}
            icon
          />
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-2.5 [scrollbar-width:none] md:px-8 md:pb-3" role="group" aria-label="Vehicle category">
          {["", ...categories].map((c) => (
            <button
              key={c || "all"}
              onClick={() => set("category", c)}
              aria-pressed={category === c}
              className={cn("chip shrink-0", category === c ? "border-ink bg-ink text-white" : "border-line bg-paper hover:border-ink")}
            >
              {c ? `${c}s` : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-8">
        {active.state === "ready" && <SourceBanner source={active.source} fallbackReason={active.fallback} />}
        {active.state === "ready" && (
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {shown.length} {shown.length === 1 ? "vehicle" : "vehicles"}
            {model ? ` · ${model} trims` : ""} · {year} model year
          </p>
        )}

        {active.state === "ready" && recommendations && !model && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Recommend label="Best for trade-in value" vehicle={recommendations.trade} reason={recommendations.reason} />
            <Recommend label="Best for your current situation" vehicle={recommendations.situation} reason="Uses the life change on your account." />
          </div>
        )}

        <div className="mt-6">
          {active.state === "loading" ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[26rem]" />
              ))}
            </div>
          ) : active.state === "error" ? (
            <ErrorState message={active.message} onRetry={() => setReload((n) => n + 1)} />
          ) : shown.length === 0 ? (
            <EmptyState title="No vehicles match those filters.">Try a different category, fuel type, or search.</EmptyState>
          ) : (
            <Stagger key={`${year}-${model}-${category}-${seats}-${fuel}-${sort}-${safePage}`} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((v) => (
                <StaggerItem key={v.id}>
                  <VehicleCard v={v} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
        {active.state === "ready" && shown.length > 9 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="text-muted">
              Page {safePage} of {pageCount} · 9 per page
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={safePage <= 1} onClick={() => set("page", String(safePage - 1))} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">
                Previous
              </button>
              <button type="button" disabled={safePage >= pageCount} onClick={() => set("page", String(safePage + 1))} className="rounded-full border border-line px-4 py-2 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      <CompareTray />
    </main>
  );
}

function recommend(list: VehicleRecord[], life: string) {
  const priced = list.filter((v) => v.msrp.value != null).sort((a, b) => (a.msrp.value ?? 0) - (b.msrp.value ?? 0));
  if (!priced.length) return null;
  const text = life.toLowerCase();
  const trade = priced[0];
  let situation = priced[Math.floor(priced.length / 2)];
  if (/child|baby|family|married/.test(text)) {
    situation = [...list].sort((a, b) => (b.seating ?? 0) - (a.seating ?? 0))[0] ?? situation;
  } else if (/expense|job|lost|fell|cut|hard|payment|budget|\$/.test(text)) {
    situation = priced[0];
  }
  return {
    trade,
    situation,
    reason: life
      ? `Based on what you told us: “${life}”. Prices are CarsXE base MSRP, not a financing offer.`
      : "Based on the payment and vehicle on your account. Prices are CarsXE base MSRP, not a financing offer.",
  };
}

function Recommend({ label, vehicle, reason }: { label: string; vehicle: VehicleRecord; reason: string }) {
  return (
    <Link to={vehiclePath(vehicle)} className="card p-5 text-left">
      <div className="text-xs font-semibold uppercase tracking-wide text-signal">{label}</div>
      <div className="mt-2 text-xl font-semibold">
        {vehicle.year} {vehicle.model}
      </div>
      <p className="mt-1 text-sm text-muted">
        {vehicle.category} · {vehicle.seating ? `${vehicle.seating} seats` : "Seats pending"} · {vehicle.msrp.value ? money(vehicle.msrp.value) : "MSRP pending"}
      </p>
      <p className="mt-2 text-sm text-muted">{reason}</p>
    </Link>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  icon?: boolean;
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      {icon && <SlidersHorizontal className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("field cursor-pointer appearance-none rounded-full py-2.5 pr-8", icon && "pl-10")}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3.5 text-xs text-muted">
        ▾
      </span>
    </label>
  );
}
