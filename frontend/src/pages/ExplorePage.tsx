import { AnimatePresence, motion } from "motion/react";
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
import { EmptyState, ErrorState, Skeleton } from "../components/ui/kit";
import { EASE, Stagger, StaggerItem } from "../components/ui/motion";
import { CATEGORY_IMAGE, categoryKey } from "../media/vehicleImages";
import { cn } from "../lib/format";
import { efficiencyScore } from "../lib/spec";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

const SORTS = {
  model: { label: "Model A–Z", fn: (a: VehicleRecord, b: VehicleRecord) => a.model.localeCompare(b.model) },
  hp: { label: "Horsepower: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (b.horsepower ?? -1) - (a.horsepower ?? -1) },
  efficiency: { label: "Efficiency: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (efficiencyScore(b) ?? -1) - (efficiencyScore(a) ?? -1) },
  seats: { label: "Seats: high to low", fn: (a: VehicleRecord, b: VehicleRecord) => (b.seating ?? -1) - (a.seating ?? -1) },
} as const;
type SortKey = keyof typeof SORTS;

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T; source: DataSource; fallback: string | null };

export function ExplorePage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [catalog, setCatalog] = useState<Load<VehicleRecord[]>>({ state: "loading" });
  const [trimCards, setTrimCards] = useState<Load<VehicleRecord[]> | null>(null);
  const [reload, setReload] = useState(0);

  const preferredYear = (status?.default_year && years.includes(status.default_year) ? status.default_year : years[0]) || 0;
  const allYears = !params.get("year") || params.get("year") === "all";
  const year = allYears ? 0 : Number(params.get("year")) || preferredYear;
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
    if (!year && !(allYears && years.length)) return;
    let live = true;
    setCatalog({ state: "loading" });
    const load = allYears
      ? Promise.allSettled(years.map((y) => getCatalog(y))).then((results) => {
          const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
          if (!ok.length) throw (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
          return { ...ok[0], data: ok.flatMap((r) => r.data) };
        })
      : getCatalog(year);
    load
      .then((r) => live && setCatalog({ state: "ready", data: r.data, source: r.source, fallback: r.fallback_reason }))
      .catch((err) => live && setCatalog({ state: "error", message: apiErrorMessage(err, "We couldn't load the catalog.") }));
    return () => {
      live = false;
    };
  }, [allYears, year, years, reload]);

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
      .filter((v) => !allYears || !model || v.model === model)
      .filter((v) => !category || v.category === category)
      .filter((v) => !seats || String(v.seating ?? "") === seats)
      .filter((v) => !fuel || v.fuel_type === fuel)
      .filter((v) => !needle || `${v.model} ${v.trim ?? ""} ${v.category ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => SORTS[sort].fn(a, b) || b.year - a.year);
  }, [active, allYears, category, fuel, model, q, seats, sort]);

  const pageCount = Math.max(1, Math.ceil(shown.length / 9));
  const safePage = Math.min(page, pageCount);
  const pageItems = shown.slice((safePage - 1) * 9, safePage * 9);
  const recommendations = useMemo(() => recommend(catalog.state === "ready" ? catalog.data : [], account?.life_change ?? ""), [account?.life_change, catalog]);

  const categories = status?.categories ?? [];
  const heroImage = category ? CATEGORY_IMAGE[categoryKey(category, fuel)] : fuel === "Electric" ? CATEGORY_IMAGE.electric : fuel ? CATEGORY_IMAGE.hybrids : CATEGORY_IMAGE.trucks;
  const fuels = status?.fuel_types ?? [];
  const loaded = active.state === "ready" ? active.data : [];
  // Seats and horsepower are not in NHTSA/EPA data, so their controls only appear when some vehicle has them.
  const seatOptions = [...new Set(loaded.flatMap((v) => (v.seating != null ? [String(v.seating)] : [])))].sort((a, b) => +a - +b);
  const sortOptions = (Object.keys(SORTS) as SortKey[]).filter(
    (k) => (k !== "hp" || loaded.some((v) => v.horsepower != null)) && (k !== "seats" || loaded.some((v) => v.seating != null))
  );

  return (
    <main className="pb-28">
      <section data-dark-top className="relative isolate overflow-hidden bg-charcoal pt-16 text-white md:pt-[72px]">
        <AnimatePresence initial={false}>
          <motion.img
            key={heroImage}
            src={heroImage}
            alt=""
            aria-hidden
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-90 md:w-[70%]"
          />
        </AnimatePresence>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal via-charcoal/85 to-charcoal/10 md:via-charcoal/70" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-charcoal/60 to-transparent" />
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <p className="eyebrow">Explore Toyota vehicles</p>
            <h1 className="mt-4 max-w-[14ch] text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.03em]">
              {category ? `Toyota ${category.toLowerCase()}s.` : "Find the Toyota that fits your life."}
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/70">
              Browse every model and trim we have data for. Specs are shown only when the source supplies them.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl md:top-[72px]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] md:gap-3 md:px-8 md:py-3 xl:overflow-visible [&>*]:shrink-0">
          <label className="relative min-w-[13rem] flex-1">
            <span className="sr-only">Search models</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => set("q", e.target.value)} placeholder="Search models" className="field rounded-full py-2.5 pl-10" />
          </label>
          <Select label="Model year" value={allYears ? "all" : String(year || "")} onChange={(v) => set("year", v)} options={[["all", "All years"], ...years.map((y) => [String(y), String(y)] as [string, string])]} />
          <Select label="Model" value={model} onChange={(v) => set("model", v)} options={[["", "All models"], ...models.map((m) => [m, m] as [string, string])]} />
          <Select label="Fuel type" value={fuel} onChange={(v) => set("fuel", v)} options={[["", "Any fuel"], ...fuels.map((f) => [f, f] as [string, string])]} />
          {seatOptions.length > 0 && (
            <Select label="Seats" value={seats} onChange={(v) => set("seats", v)} options={[["", "Any seats"], ...seatOptions.map((n) => [n, `${n} seats`] as [string, string])]} />
          )}
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => set("sort", v)}
            options={sortOptions.map((k) => [k, SORTS[k].label] as [string, string])}
            icon
          />
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none] md:px-8" role="group" aria-label="Vehicle category">
          {["", ...categories].map((c) => {
            const on = category === c;
            return (
              <button
                key={c || "all"}
                onClick={() => set("category", c)}
                aria-pressed={on}
                className={cn(
                  "group flex shrink-0 items-center gap-2.5 rounded-2xl border p-1.5 pr-4 text-sm font-semibold transition-[border-color,background-color,color] duration-200",
                  on ? "border-ink bg-ink text-white" : "border-line bg-paper hover:border-ink/40"
                )}
              >
                <span className="h-9 w-14 overflow-hidden rounded-xl bg-mist">
                  {c ? (
                    <img src={CATEGORY_IMAGE[categoryKey(c)]} alt="" aria-hidden loading="lazy" className="h-full w-full scale-125 object-cover transition-transform duration-300 group-hover:scale-[1.35]" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[10px] font-semibold uppercase tracking-wider text-muted">All</span>
                  )}
                </span>
                {c ? `${c}s` : "All models"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-8">
        {active.state === "ready" && (
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {shown.length} {shown.length === 1 ? "vehicle" : "vehicles"}
            {model ? ` · ${model}${allYears ? "" : " trims"}` : ""} · {allYears ? "all model years" : `${year} model year`}
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
            <EmptyState title="No matching Toyota models were found for this selection.">Try a different category, fuel type, or search.</EmptyState>
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
  if (!priced.length) return null; // NHTSA does not supply MSRP, so this stays empty.
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
      ? `Based on what you told us: “${life}”. Verified pricing is not currently connected.`
      : "Based on the payment and vehicle on your account. Verified pricing is not currently connected.",
  };
}

function Recommend({ label, vehicle, reason }: { label: string; vehicle: VehicleRecord; reason: string }) {
  return (
    <Link to={vehiclePath(vehicle)} className="card card-hover flex gap-4 overflow-hidden p-0 text-left">
      <img src={CATEGORY_IMAGE[categoryKey(vehicle.category, vehicle.fuel_type)]} alt="" aria-hidden loading="lazy" className="hidden w-40 shrink-0 object-cover sm:block" />
      <div className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-signal">{label}</div>
      <div className="mt-2 text-xl font-semibold">
        {vehicle.year} {vehicle.model}
      </div>
      <p className="mt-1 text-sm text-muted">
        {vehicle.category} · {vehicle.fuel_type || "Fuel unclassified"}
      </p>
      <p className="mt-2 text-sm text-muted">{reason}</p>
      </div>
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
