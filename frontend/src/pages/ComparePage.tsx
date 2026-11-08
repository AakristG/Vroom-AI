import { Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  apiErrorMessage,
  compareVehicles,
  getCatalog,
  getTrims,
  getYears,
  vehicleId,
  vehiclePath,
  type VehicleRecord,
} from "../api/vehicles";
import { VehicleMedia } from "../components/vehicles/VehicleCard";
import { EmptyState, ErrorState, PageIntro, Skeleton, SourceBadge } from "../components/ui/kit";
import { Reveal } from "../components/ui/motion";
import { cn, money } from "../lib/format";
import { NA, mpgRange, num, vehicleName } from "../lib/spec";
import { useAssistant, usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";
import { COMPARE_LIMIT, useCompare } from "../state/compare";

const COLORS = ["#eb0a1e", "#16171a", "#8a8f98"];
const KWH_PER_GALLON_EQUIVALENT = 33.7;

type Better = "high" | "low";
interface Row {
  label: string;
  value: (v: VehicleRecord) => number | string | null;
  format?: (v: VehicleRecord) => string;
  better?: Better;
}

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: "Overview",
    rows: [
      { label: "Vehicle type", value: (v) => v.category },
      { label: "Fuel type", value: (v) => v.fuel_type },
      { label: "Data source", value: (v) => "NHTSA" },
      { label: "Safety rating", value: (v) => (v.safety_rating_available ? v.safety_rating ?? null : null), format: (v) => (v.safety_rating_available && v.safety_rating != null ? `${v.safety_rating} / 5` : "Safety rating unavailable") },
    ],
  },
  {
    group: "Performance",
    rows: [
      { label: "Engine", value: (v) => v.engine },
      { label: "Horsepower", value: (v) => v.horsepower, format: (v) => num(v.horsepower, " hp"), better: "high" },
      { label: "Torque", value: (v) => v.torque_lb_ft, format: (v) => num(v.torque_lb_ft, " lb-ft"), better: "high" },
      { label: "Drivetrain", value: (v) => v.drivetrain },
      { label: "Transmission", value: (v) => v.transmission },
    ],
  },
  {
    group: "Efficiency",
    rows: [
      { label: "City", value: (v) => v.mpg.city, format: (v) => mpgRange(v.mpg.city, v.mpg.city_high), better: "high" },
      { label: "Highway", value: (v) => v.mpg.highway, format: (v) => mpgRange(v.mpg.highway, v.mpg.highway_high), better: "high" },
      { label: "Combined", value: (v) => v.mpg.combined, format: (v) => mpgRange(v.mpg.combined, v.mpg.combined_high), better: "high" },
      { label: "MPGe (electric)", value: (v) => v.mpge, format: (v) => num(v.mpge), better: "high" },
      { label: "Electric range", value: (v) => v.ev_range_mi, format: (v) => num(v.ev_range_mi, " mi"), better: "high" },
    ],
  },
  {
    group: "Capacity & size",
    rows: [
      { label: "Seating", value: (v) => v.seating, format: (v) => num(v.seating), better: "high" },
      { label: "Cargo", value: (v) => v.cargo_cu_ft, format: (v) => num(v.cargo_cu_ft, " cu ft"), better: "high" },
      { label: "Length", value: (v) => v.dimensions.length_in, format: (v) => num(v.dimensions.length_in, " in") },
      { label: "Width", value: (v) => v.dimensions.width_in, format: (v) => num(v.dimensions.width_in, " in") },
      { label: "Height", value: (v) => v.dimensions.height_in, format: (v) => num(v.dimensions.height_in, " in") },
      { label: "Curb weight", value: (v) => v.curb_weight_lb, format: (v) => num(v.curb_weight_lb, " lb") },
    ],
  },
  {
    group: "Safety & features",
    rows: [
      { label: "Safety items listed", value: (v) => (Array.isArray(v.safety) && v.safety.length ? v.safety.slice(0, 5).join(", ") : null) },
      { label: "Highlighted features", value: (v) => (v.features?.length ? v.features.slice(0, 5).join(", ") : null) },
    ],
  },
];

interface Assumptions {
  miles: number;
  gas: number;
  kwh: number;
  other: number;
}

/** Annual energy cost from verified efficiency only. */
function annualFuel(v: VehicleRecord, a: Assumptions): { cost: number | null; basis?: string; missing?: string } {
  if (v.fuel_type === "Electric") {
    if (!v.mpge) return { cost: null, missing: "MPGe" };
    return { cost: ((a.miles * KWH_PER_GALLON_EQUIVALENT) / v.mpge) * a.kwh, basis: `${v.mpge} MPGe` };
  }
  if (v.fuel_type === "Hydrogen fuel cell") return { cost: null, missing: "hydrogen price and efficiency" };
  if (!v.mpg.combined) return { cost: null, missing: "combined mpg" };
  const note = v.fuel_type === "Plug-in hybrid" ? " (gas-only driving)" : "";
  return { cost: (a.miles / v.mpg.combined) * a.gas, basis: `${v.mpg.combined} mpg${note}` };
}

export function ComparePage() {
  const [params, setParams] = useSearchParams();
  const compare = useCompare();
  const { profile } = useAuth();
  const { ask } = useAssistant();
  const urlIds = params.getAll("v");
  const [data, setData] = useState<{ loading: boolean; vehicles: VehicleRecord[]; errors: { id: string; detail: string }[]; error?: string }>({
    loading: false,
    vehicles: [],
    errors: [],
  });
  const [assume, setAssume] = useState<Assumptions>({
    miles: profile?.vehicle.annual_miles_est ?? 12000,
    gas: 3.25,
    kwh: 0.16,
    other: 0,
  });

  // A URL that names vehicles (a shared link, or the assistant) seeds the selection; after that the URL mirrors it.
  const written = useRef<string | null>(null);
  useEffect(() => {
    const incoming = params.toString();
    if (incoming !== written.current && urlIds.length && urlIds.join() !== compare.ids.join()) compare.replace(urlIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const ids = compare.ids;
  usePageContext("compare", ids);

  useEffect(() => {
    const next = new URLSearchParams(ids.map((id) => ["v", id]));
    if (written.current === null && urlIds.length && urlIds.join() !== ids.join()) return;
    written.current = next.toString();
    if (params.toString() !== written.current) setParams(next, { replace: true });
    if (!ids.length) {
      setData({ loading: false, vehicles: [], errors: [] });
      return;
    }
    let live = true;
    setData((d) => ({ ...d, loading: true, error: undefined }));
    compareVehicles(ids)
      .then((r) => live && setData({ loading: false, vehicles: r.vehicles, errors: r.errors }))
      .catch((err) => live && setData({ loading: false, vehicles: [], errors: [], error: apiErrorMessage(err, "We couldn't load the comparison.") }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join()]);

  const vs = data.vehicles;
  const names = vs.map((v) => vehicleName(v));

  return (
    <main className="pb-24">
      <PageIntro eyebrow="Compare models" title="Line them up, side by side.">
        Pick up to three Toyotas. Differences are highlighted, and every estimate shows its assumptions.
      </PageIntro>

      <div className="mx-auto max-w-7xl px-5 pt-10 md:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: COMPARE_LIMIT }).map((_, i) => {
            const v = vs.find((x) => x.id === ids[i]);
            return ids[i] ? (
              <SlotFilled key={ids[i]} id={ids[i]} v={v} color={COLORS[i]} loading={data.loading && !v} onRemove={() => compare.remove(ids[i])} />
            ) : (
              <VehiclePicker key={`empty-${i}`} onPick={(id) => compare.replace([...ids, id])} exclude={ids} />
            );
          })}
        </div>

        {data.errors.map((e) => (
          <p key={e.id} className="mt-3 text-sm text-signal">
            {e.id.replace(/\|/g, " ")}: {e.detail}
          </p>
        ))}
        {data.error && (
          <div className="mt-6">
            <ErrorState message={data.error} />
          </div>
        )}

        {vs.length === 0 && !data.loading && !data.error && (
          <div className="mt-10">
            <EmptyState title="Choose vehicles to compare.">
              Use the pickers above, or add vehicles from <Link to="/vehicles" className="font-medium text-signal">Explore Vehicles</Link>.
            </EmptyState>
          </div>
        )}

        {vs.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => ask(vs.length > 1 ? `Which of these makes more sense for my commute?` : `Is the ${names[0]} a good fit for me?`)}
                className="btn-primary"
              >
                <Sparkles className="h-4 w-4" /> Ask which fits my commute
              </button>
              <span className="text-sm text-muted">NextMove AI sees the vehicles on this page.</span>
            </div>

            <SpecTable vs={vs} />

            <section aria-labelledby="costs" className="mt-12">
              <Reveal className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h2 id="costs" className="text-3xl font-semibold tracking-tight">
                    Cost of ownership
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted">
                    Fuel or electricity only, from each vehicle's listed efficiency and your inputs. Add other yearly costs (insurance, maintenance) if you know them.
                    These are estimates, not quotes.
                  </p>
                </div>
              </Reveal>
              <div className="card mt-5 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField label="Miles per year" value={assume.miles} step={500} onChange={(miles) => setAssume({ ...assume, miles })} />
                <NumberField label="Gas price ($/gal)" value={assume.gas} step={0.05} onChange={(gas) => setAssume({ ...assume, gas })} />
                <NumberField label="Electricity ($/kWh)" value={assume.kwh} step={0.01} onChange={(kwh) => setAssume({ ...assume, kwh })} />
                <NumberField label="Other yearly costs ($)" value={assume.other} step={100} onChange={(other) => setAssume({ ...assume, other })} />
              </div>
              <CostCharts vs={vs} assume={assume} />
            </section>

            <PerformanceCharts vs={vs} />
          </>
        )}
      </div>
    </main>
  );
}

function SlotFilled({ id, v, color, loading, onRemove }: { id: string; v?: VehicleRecord; color: string; loading: boolean; onRemove: () => void }) {
  return (
    <div className="card relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <button onClick={onRemove} aria-label={`Remove ${id}`} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/85 backdrop-blur hover:bg-white">
        <X className="h-4 w-4" />
      </button>
      {loading || !v ? (
        <div className="p-5">
          <Skeleton className="aspect-[16/9]" />
          <Skeleton className="mt-4 h-6 w-2/3" />
        </div>
      ) : (
        <>
          <VehicleMedia v={v} className="aspect-[16/9]" />
          <div className="flex items-center justify-between gap-2 p-5">
            <div>
              <Link to={vehiclePath(v)} className="text-lg font-semibold tracking-tight hover:text-signal">
                {vehicleName(v)}
              </Link>
              <p className="text-xs text-muted">
                {v.category}
                {v.fuel_type ? ` · ${v.fuel_type}` : ""}
              </p>
            </div>
            <SourceBadge source={v.source} />
          </div>
        </>
      )}
    </div>
  );
}

function VehiclePicker({ onPick, exclude }: { onPick: (id: string) => void; exclude: string[] }) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(0);
  const [models, setModels] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [trims, setTrims] = useState<string[]>([]);
  const [trim, setTrim] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getYears()
      .then((r) => {
        setYears(r.data);
        setYear(r.data[0] ?? 0);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!year) return;
    getCatalog(year)
      .then((r) => setModels([...new Set(r.data.map((v) => v.model))].sort()))
      .catch(() => setModels([]));
  }, [year]);
  useEffect(() => {
    setTrims([]);
    setTrim("");
    if (!model) return;
    getTrims(year, model)
      .then((r) => {
        setTrims(r.data);
        setTrim(r.data[0] ?? "");
      })
      .catch(() => undefined);
  }, [year, model]);

  const matches = models.filter((m) => m.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const id = model ? vehicleId(year, model, trim || null) : "";

  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-paper/60 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Plus className="h-4 w-4" /> Add a vehicle
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-xs text-muted">
          Model year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="field mt-1 cursor-pointer">
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="relative">
          <label className="block text-xs text-muted" htmlFor={`model-${exclude.length}`}>
            Model
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id={`model-${exclude.length}`}
              role="combobox"
              aria-expanded={open}
              aria-controls={`model-list-${exclude.length}`}
              aria-autocomplete="list"
              value={query}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onChange={(e) => {
                setQuery(e.target.value);
                setModel("");
                setOpen(true);
              }}
              placeholder="Search a model"
              className="field pl-10"
            />
          </div>
          {open && matches.length > 0 && (
            <ul id={`model-list-${exclude.length}`} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-line bg-paper p-1 shadow-[var(--shadow-lift)]">
              {matches.map((m) => (
                <li key={m} role="option" aria-selected={m === model}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setModel(m);
                      setQuery(m);
                      setOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-daylight"
                  >
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {trims.length > 0 && (
          <label className="block text-xs text-muted">
            Trim
            <select value={trim} onChange={(e) => setTrim(e.target.value)} className="field mt-1 cursor-pointer">
              {trims.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" disabled={!model || exclude.includes(id)} onClick={() => onPick(id)} className="btn-primary w-full disabled:opacity-40">
          Add to comparison
        </button>
      </div>
    </div>
  );
}

function best(vs: VehicleRecord[], row: Row): Set<string> {
  if (!row.better || vs.length < 2) return new Set();
  const vals = vs.map((v) => ({ id: v.id, n: row.value(v) })).filter((x): x is { id: string; n: number } => typeof x.n === "number");
  if (vals.length < 2) return new Set();
  const target = row.better === "high" ? Math.max(...vals.map((x) => x.n)) : Math.min(...vals.map((x) => x.n));
  if (vals.every((x) => x.n === target)) return new Set();
  return new Set(vals.filter((x) => x.n === target).map((x) => x.id));
}

function SpecTable({ vs }: { vs: VehicleRecord[] }) {
  return (
    <Reveal className="card mt-8 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Side-by-side specifications</caption>
          <thead>
            <tr className="border-b border-line bg-mist">
              <th scope="col" className="sticky left-0 w-48 bg-mist px-5 py-4 text-left font-medium text-muted">
                Specification
              </th>
              {vs.map((v, i) => (
                <th key={v.id} scope="col" className="px-5 py-4 text-left font-semibold">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                  {vehicleName(v)}
                </th>
              ))}
            </tr>
          </thead>
          {ROWS.map((g) => (
            <tbody key={g.group}>
              <tr>
                <th colSpan={vs.length + 1} scope="colgroup" className="bg-paper px-5 pb-2 pt-6 text-left text-xs font-semibold uppercase tracking-wider text-signal">
                  {g.group}
                </th>
              </tr>
              {g.rows.map((row) => {
                const winners = best(vs, row);
                return (
                  <tr key={row.label} className="border-t border-line">
                    <th scope="row" className="sticky left-0 bg-paper px-5 py-3 text-left font-normal text-muted">
                      {row.label}
                    </th>
                    {vs.map((v) => {
                      const raw = row.value(v);
                      const text = row.format ? row.format(v) : raw == null || raw === "" ? NA : String(raw);
                      const win = winners.has(v.id);
                      return (
                        <td key={v.id} className={cn("px-5 py-3", text === NA ? "text-muted/70" : "font-medium", win && "text-go")}>
                          {text}
                          {win && <span className="ml-2 rounded-full bg-go/10 px-2 py-0.5 text-[10px] font-semibold uppercase">Best</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </Reveal>
  );
}

function ChartCard({ title, note, missing, children }: { title: string; note: string; missing: string[]; children: ReactNode }) {
  return (
    <Reveal className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 h-60">{children}</div>
      {missing.length > 0 && <p className="mt-3 rounded-xl bg-sodium/10 px-3 py-2 text-xs text-ink/80">Not charted: {missing.join("; ")}.</p>}
      <p className="mt-3 text-xs text-muted">{note}</p>
    </Reveal>
  );
}

const axis = { fontSize: 12, fill: "#5e5e5e" };
const shortName = (v: VehicleRecord) => `${v.model} ${v.trim ?? ""}`.trim();

function SingleBar({ rows, unit, format }: { rows: { name: string; value: number; color: string }[]; unit: string; format?: (n: number) => string }) {
  if (!rows.length) return <NoData />;
  const fmt = format ?? ((n: number) => `${n.toLocaleString("en-US")}${unit}`);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#ececec" />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={64} tickFormatter={(n) => fmt(Number(n))} />
        <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(n) => fmt(Number(n))} />
        <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={72} animationDuration={900}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NoData() {
  return <div className="grid h-full place-items-center rounded-2xl bg-mist text-sm text-muted">Not enough verified data to chart.</div>;
}

function years(vs: VehicleRecord[]) {
  return [...new Set(vs.map((v) => v.year))].join(", ");
}
function sources(vs: VehicleRecord[]) {
  return [...new Set(vs.map(() => "NHTSA"))].join(" and ");
}

function PerformanceCharts({ vs }: { vs: VehicleRecord[] }) {
  const pick = (get: (v: VehicleRecord) => number | null) =>
    vs.flatMap((v, i) => (get(v) == null ? [] : [{ name: shortName(v), value: get(v)!, color: COLORS[i] }]));
  const missing = (get: (v: VehicleRecord) => number | null, field: string) => vs.filter((v) => get(v) == null).map((v) => `${shortName(v)} (no ${field})`);
  const base = `Source: ${sources(vs)}. Model year ${years(vs)}.`;

  const mpgRows = vs.filter((v) => v.mpg.city || v.mpg.highway || v.mpg.combined);
  const dimRows = vs.filter((v) => v.dimensions.length_in || v.dimensions.width_in || v.dimensions.height_in);

  return (
    <section className="mt-12" aria-labelledby="charts">
      <h2 id="charts" className="text-3xl font-semibold tracking-tight">
        How they compare
      </h2>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Fuel efficiency (mpg)"
          note={`${base} Gas and hybrid ratings in miles per gallon. Electric ratings (MPGe) are not on this axis; see the table.`}
          missing={vs.filter((v) => !mpgRows.includes(v)).map((v) => `${shortName(v)} (no mpg rating)`)}
        >
          {mpgRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(["city", "highway", "combined"] as const).map((k) => ({
                  name: k[0].toUpperCase() + k.slice(1),
                  ...Object.fromEntries(mpgRows.map((v) => [shortName(v), v.mpg[k] ?? null])),
                }))}
              >
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} unit=" mpg" width={64} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {mpgRows.map((v) => (
                  <Bar key={v.id} dataKey={shortName(v)} fill={COLORS[vs.indexOf(v)]} radius={[8, 8, 0, 0]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </ChartCard>

        <ChartCard title="Horsepower" note={`${base} Peak SAE net horsepower.`} missing={missing((v) => v.horsepower, "horsepower")}>
          <SingleBar rows={pick((v) => v.horsepower)} unit=" hp" />
        </ChartCard>

        <ChartCard title="Passenger capacity" note={`${base} Factory seating for the listed trim.`} missing={missing((v) => v.seating, "seating")}>
          <SingleBar rows={pick((v) => v.seating)} unit=" seats" format={(n) => `${n}`} />
        </ChartCard>

        <ChartCard
          title="Exterior dimensions (in)"
          note={`${base} Length, width, and height in inches.`}
          missing={vs.filter((v) => !dimRows.includes(v)).map((v) => `${shortName(v)} (no dimensions)`)}
        >
          {dimRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(["length_in", "width_in", "height_in"] as const).map((k) => ({
                  name: k.replace("_in", "").replace(/^./, (c) => c.toUpperCase()),
                  ...Object.fromEntries(dimRows.map((v) => [shortName(v), v.dimensions[k] ?? null])),
                }))}
              >
                <CartesianGrid vertical={false} stroke="#ececec" />
                <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} unit=" in" width={64} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {dimRows.map((v) => (
                  <Bar key={v.id} dataKey={shortName(v)} fill={COLORS[vs.indexOf(v)]} radius={[8, 8, 0, 0]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function CostCharts({ vs, assume }: { vs: VehicleRecord[]; assume: Assumptions }) {
  const rows = useMemo(
    () =>
      vs.map((v, i) => {
        const fuel = annualFuel(v, assume);
        const fiveYear = fuel.cost != null ? 5 * (fuel.cost + assume.other) : null;
        return { v, color: COLORS[i], fuel, fiveYear };
      }),
    [vs, assume]
  );
  const base = `Source: ${sources(vs)}, model year ${years(vs)}. ${assume.miles.toLocaleString("en-US")} mi/yr, $${assume.gas}/gal, $${assume.kwh}/kWh, 33.7 kWh per gallon-equivalent.`;
  const usd = (n: number) => money(Math.round(n));

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <ChartCard
        title="Estimated annual fuel cost"
        note={`${base} ${rows.filter((r) => r.fuel.basis).map((r) => `${shortName(r.v)}: ${r.fuel.basis}`).join("; ")}.`}
        missing={rows.filter((r) => r.fuel.cost == null).map((r) => `${shortName(r.v)} (needs ${r.fuel.missing})`)}
      >
        <SingleBar rows={rows.flatMap((r) => (r.fuel.cost == null ? [] : [{ name: shortName(r.v), value: Math.round(r.fuel.cost), color: r.color }]))} unit="" format={usd} />
      </ChartCard>
      <ChartCard
        title="Estimated five-year fuel and other costs"
        note={`Five years of fuel${assume.other ? ` + $${assume.other.toLocaleString("en-US")}/yr other costs` : ""}. Vehicle purchase price is not included — NHTSA and CarImagesAPI do not publish MSRP.`}
        missing={rows.filter((r) => r.fiveYear == null).map((r) => `${shortName(r.v)} (needs ${r.fuel.missing})`)}
      >
        <SingleBar rows={rows.flatMap((r) => (r.fiveYear == null ? [] : [{ name: shortName(r.v), value: Math.round(r.fiveYear), color: r.color }]))} unit="" format={usd} />
      </ChartCard>
    </div>
  );
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="field mt-2"
      />
    </label>
  );
}
