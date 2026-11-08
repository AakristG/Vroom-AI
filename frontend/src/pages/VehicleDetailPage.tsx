import { ArrowLeft, Check, ChevronDown, Plus, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiErrorMessage, decodeVin, getTrims, getVehicle, vehiclePath, type VehicleRecord } from "../api/vehicles";
import { CompareTray } from "../components/vehicles/CompareTray";
import { VehicleMedia } from "../components/vehicles/VehicleCard";
import { ErrorState, Skeleton, SourceBadge } from "../components/ui/kit";
import { Reveal } from "../components/ui/motion";
import { cn } from "../lib/format";
import { NA, mpgRange, num, vehicleName } from "../lib/spec";
import { useAssistant, usePageContext } from "../state/assistant";
import { useCompare } from "../state/compare";

export function VehicleDetailPage() {
  const params = useParams();
  const year = Number(params.year);
  const model = decodeURIComponent(params.model ?? "");
  const trim = params.trim ? decodeURIComponent(params.trim) : null;
  const navigate = useNavigate();
  const [state, setState] = useState<{ v?: VehicleRecord; error?: string }>({});
  const [trims, setTrims] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const compare = useCompare();
  const { ask } = useAssistant();

  usePageContext("vehicle-detail", state.v ? [state.v.id] : []);

  useEffect(() => {
    let live = true;
    setState({});
    getVehicle(year, model, trim)
      .then((v) => live && setState({ v }))
      .catch((err) => live && setState({ error: apiErrorMessage(err, "We couldn't load this vehicle.") }));
    getTrims(year, model)
      .then((r) => live && setTrims(r.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [year, model, trim, reload]);

  const v = state.v;

  return (
    <main className="pb-28 pt-16 md:pt-[72px]">
      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-8">
        <Link to="/vehicles" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> All vehicles
        </Link>
      </div>

      {state.error ? (
        <div className="mx-auto max-w-3xl px-5 py-16">
          <ErrorState message={state.error} onRetry={() => setReload((n) => n + 1)} />
        </div>
      ) : !v ? (
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:px-8 lg:grid-cols-2">
          <Skeleton className="aspect-[16/10]" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      ) : (
        <>
          <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-10 md:px-8 lg:grid-cols-[1.15fr_0.85fr]">
            <Reveal>
              <VehicleMedia v={v} eager className="aspect-[16/10] rounded-3xl" />
            </Reveal>
            <Reveal delay={0.08}>
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={v.source} />
                <span className="text-sm text-muted">
                  {v.category}
                  {v.fuel_type ? ` · ${v.fuel_type}` : ""}
                </span>
              </div>
              <h1 className="mt-3 text-[clamp(2.25rem,4.5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
                {v.year} Toyota {v.model}
              </h1>
              <p className="mt-2 text-xl text-muted">{v.style_name ?? v.trim ?? ""}</p>

              {trims.length > 1 && (
                <label className="mt-6 block max-w-xs text-sm">
                  <span className="font-medium">Trim</span>
                  <select
                    value={trim ?? v.trim ?? ""}
                    onChange={(e) => navigate(vehiclePath({ year: v.year, model: v.model, trim: e.target.value }))}
                    className="field mt-2 cursor-pointer"
                  >
                    {trims.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
                <Stat
                  label={v.fuel_type === "Electric" ? "Efficiency" : "Combined"}
                  value={v.fuel_type === "Electric" ? mpgRange(v.mpge, null, "") : mpgRange(v.mpg.combined, v.mpg.combined_high, "")}
                  unit={v.fuel_type === "Electric" ? (v.mpge ? "MPGe" : "") : v.mpg.combined ? "mpg" : ""}
                />
                <Stat label="Fuel" value={v.fuel_type ?? NA} />
                <Stat label="Category" value={v.category ?? NA} />
              </div>
              {v.epa?.note ? <p className="mt-3 text-xs text-muted">{v.epa.note}</p> : null}

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={() => compare.toggle(v.id)}
                  disabled={!compare.has(v.id) && compare.full}
                  className={cn("btn-ghost", compare.has(v.id) ? "border-ink bg-ink text-white" : "border-line hover:border-ink", "disabled:opacity-40")}
                >
                  {compare.has(v.id) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {compare.has(v.id) ? "In comparison" : "Add to compare"}
                </button>
                <button onClick={() => ask(`Is the ${vehicleName(v)} a good fit for my commute and budget?`)} className="btn-primary">
                  <Sparkles className="h-4 w-4" /> Ask NextMove AI
                </button>
              </div>
            </Reveal>
          </section>

          <section className="mx-auto grid max-w-7xl gap-5 px-5 md:grid-cols-2 md:px-8 lg:grid-cols-4">
            <SpecCard
              title="Performance"
              rows={[
                ["Engine", v.engine],
                ["Horsepower", v.horsepower != null ? num(v.horsepower, " hp") : null],
                ["Torque", v.torque_lb_ft != null ? num(v.torque_lb_ft, " lb-ft") : null],
                ["Drivetrain", v.drivetrain],
                ["Transmission", v.transmission],
              ]}
            />
            <SpecCard
              title="Efficiency"
              rows={[
                ["Fuel type", v.fuel_type],
                ["City", v.mpg.city != null ? mpgRange(v.mpg.city, v.mpg.city_high) : null],
                ["Highway", v.mpg.highway != null ? mpgRange(v.mpg.highway, v.mpg.highway_high) : null],
                ["Combined", v.mpg.combined != null ? mpgRange(v.mpg.combined, v.mpg.combined_high) : null],
                ["MPGe", v.mpge != null ? num(v.mpge) : null],
                ["Electric range", v.ev_range_mi != null ? num(v.ev_range_mi, " mi") : null],
              ]}
            />
            <SpecCard
              title="Capacity"
              rows={[
                ["Seating", v.seating != null ? num(v.seating) : null],
                ["Cargo", v.cargo_cu_ft != null ? num(v.cargo_cu_ft, " cu ft") : null],
                ["Curb weight", v.curb_weight_lb != null ? num(v.curb_weight_lb, " lb") : null],
              ]}
            />
            <SpecCard
              title="Dimensions"
              rows={[
                ["Length", v.dimensions.length_in != null ? num(v.dimensions.length_in, " in") : null],
                ["Width", v.dimensions.width_in != null ? num(v.dimensions.width_in, " in") : null],
                ["Height", v.dimensions.height_in != null ? num(v.dimensions.height_in, " in") : null],
                ["Wheelbase", v.dimensions.wheelbase_in != null ? num(v.dimensions.wheelbase_in, " in") : null],
              ]}
            />
          </section>

          <SafetyAndRecalls v={v} />

          {v.spec_groups && v.spec_groups.length > 0 && <AllSpecs groups={v.spec_groups} />}

          <section className="mx-auto mt-5 grid max-w-7xl gap-5 px-5 md:grid-cols-[1.2fr_0.8fr] md:px-8">
            <VinDecode year={v.year} />
            <div className="card p-6 text-sm leading-relaxed text-muted">
              <h2 className="text-base font-semibold text-ink">Where this comes from</h2>
              <p className="mt-2">{v.source_note}</p>
              {v.image && <p className="mt-2">{v.image.license_note}</p>}
            </div>
          </section>
        </>
      )}
      <CompareTray />
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-paper p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight", value === NA && "text-base font-medium text-muted")}>
        {value} {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function SpecCard({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  const filled = rows.filter(([, val]) => val && val !== NA);
  if (!filled.length) {
    return (
      <Reveal className="card p-6">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-3 text-sm text-muted">
          {title === "Dimensions"
            ? "NHTSA and EPA do not publish exterior measurements for this model."
            : "No verified figures from NHTSA or EPA for these fields."}
        </p>
      </Reveal>
    );
  }
  return (
    <Reveal className="card p-6">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-4 space-y-2.5 text-sm">
        {filled.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line pb-2.5 last:border-0">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-medium">{val}</dd>
          </div>
        ))}
      </dl>
    </Reveal>
  );
}

function AllSpecs({ groups }: { groups: NonNullable<VehicleRecord["spec_groups"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-auto mt-5 max-w-7xl px-5 md:px-8">
      <div className="card p-6">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between font-semibold">
          All listed specifications ({groups.reduce((n, g) => n + g.items.length, 0)})
          <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.category}>
                <h3 className="text-sm font-semibold">{g.category}</h3>
                <dl className="mt-2 space-y-1 text-xs">
                  {g.items.map((item, i) => (
                    <div key={`${item.name}-${i}`} className="flex justify-between gap-3">
                      <dt className="capitalize text-muted">{item.name}</dt>
                      <dd className="text-right">{item.value ?? "Included"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SafetyAndRecalls({ v }: { v: VehicleRecord }) {
  const rating = v.safety_rating_available ? v.safety_rating : null;
  const recallCount = v.recall_count;
  const recallNote =
    typeof v.recalls === "object" && v.recalls && "note" in v.recalls ? String(v.recalls.note || "") : "";
  const safety = typeof v.safety === "object" && v.safety && !Array.isArray(v.safety) ? v.safety : null;
  const reason = safety && "reason" in safety ? String(safety.reason || "") : "";
  const variants = safety && Array.isArray(safety.variants) ? (safety.variants as { description?: string }[]) : [];
  return (
    <section className="mx-auto mt-5 grid max-w-7xl gap-5 px-5 md:grid-cols-2 md:px-8">
      <div className="card p-6">
        <h2 className="font-semibold">NHTSA safety rating</h2>
        <p className="mt-3 text-3xl font-semibold">{rating != null ? `${rating} / 5` : "Safety rating unavailable"}</p>
        <p className="mt-2 text-sm text-muted">
          {rating != null
            ? "Overall NHTSA rating for the only published crash-tested variant of this model year."
            : reason || "NHTSA has not published a crash-test result we can show for this model year."}
        </p>
        {variants.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {variants.map((item, i) => (
              <li key={`${item.description}-${i}`}>{item.description}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="card p-6">
        <h2 className="font-semibold">NHTSA recalls</h2>
        <p className="mt-3 text-3xl font-semibold">{recallCount == null ? NA : recallCount}</p>
        <p className="mt-2 text-sm text-muted">
          {recallNote || "Model-year campaigns from NHTSA. This is not proof that a specific VIN has an open recall."}
        </p>
      </div>
    </section>
  );
}

function VinDecode({ year }: { year: number }) {
  const [vin, setVin] = useState("");
  const [result, setResult] = useState<{ busy?: boolean; text?: string; error?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setResult({ busy: true });
    try {
      const data = await decodeVin(vin.trim(), year);
      if (!data.decode_ok) setResult({ error: data.error_text || "NHTSA could not decode that VIN." });
      else
        setResult({
          text: `NHTSA decoded ending ${data.vin_last4} as ${data.model_year ?? ""} ${data.make ?? ""} ${data.model ?? ""}. ${data.body_class ?? ""} ${data.fuel ? `Fuel: ${data.fuel}.` : ""}`.replace(/\s+/g, " ").trim(),
        });
    } catch (err) {
      setResult({ error: apiErrorMessage(err, "VIN decode is unavailable right now.") });
    }
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="font-semibold">Decode a VIN</h2>
      <p className="mt-1 text-sm text-muted">Uses NHTSA vPIC. The full VIN is sent only to our backend, then to NHTSA. It is not a market-value estimate.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label>
          <span className="sr-only">VIN</span>
          <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} placeholder="VIN (17 characters)" className="field font-mono" />
        </label>
        <button disabled={vin.trim().length !== 17 || result.busy} className="btn-primary disabled:opacity-40">
          {result.busy ? "Checking…" : "Decode"}
        </button>
      </div>
      {result.text && <p className="mt-3 rounded-2xl bg-go/10 px-4 py-3 text-sm">{result.text}</p>}
      {result.error && <p className="mt-3 rounded-2xl bg-sodium/15 px-4 py-3 text-sm">{result.error}</p>}
    </form>
  );
}
