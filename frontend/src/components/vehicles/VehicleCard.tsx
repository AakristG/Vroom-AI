import { useInView } from "motion/react";
import { Check, ImageOff, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getVehicleImage, vehiclePath, type VehicleImage, type VehicleRecord } from "../../api/vehicles";
import { cn } from "../../lib/format";
import { efficiency, NA, num } from "../../lib/spec";
import { COMPARE_LIMIT, useCompare } from "../../state/compare";
import { SourceBadge } from "../ui/kit";

export function VehicleMedia({ v, className, eager = false }: { v: VehicleRecord; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "200px" });
  const [image, setImage] = useState<VehicleImage | null>(v.image);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImage(v.image);
    setFailed(false);
  }, [v.id, v.image]);

  useEffect(() => {
    if (image?.url || !(inView || eager)) return;
    let live = true;
    getVehicleImage(v.year, v.model, v.trim)
      .then((img) => live && setImage(img))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [v, image, inView, eager]);

  const url = image?.url;

  return (
    <div ref={ref} className={cn("relative grid place-items-center overflow-hidden bg-gradient-to-b from-[#f1f1ef] to-[#e4e4e1]", className)}>
      {url && !failed ? (
        <>
          <img
            src={url}
            alt={`${v.year} Toyota ${v.model}`}
            loading={eager ? "eager" : "lazy"}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 text-center text-muted">
          <ImageOff className="h-8 w-8" />
          <p className="text-sm">Image unavailable</p>
        </div>
      )}
    </div>
  );
}

export function VehicleCard({ v }: { v: VehicleRecord }) {
  const compare = useCompare();
  const inCompare = compare.has(v.id);
  const blocked = !inCompare && compare.full;

  return (
    <article className="group card card-hover flex h-full flex-col overflow-hidden">
      <Link to={vehiclePath(v)} className="block" aria-label={`${v.year} ${v.model} ${v.trim ?? ""} details`}>
        <VehicleMedia v={v} className="aspect-[16/9]" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted">
              {v.year}
              {v.category ? ` · ${v.category}` : ""}
              {v.fuel_type ? ` · ${v.fuel_type}` : ""}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              <Link to={vehiclePath(v)} className="hover:text-signal">
                {v.model} <span className="text-muted">{v.trim ?? ""}</span>
              </Link>
            </h3>
          </div>
          <SourceBadge source={v.source} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {v.category ? <Spec label="Category" value={v.category} /> : null}
          {v.fuel_type ? <Spec label="Fuel" value={v.fuel_type} /> : null}
          {v.vehicle_type ? <Spec label="NHTSA type" value={v.vehicle_type} wide /> : null}
          {v.engine ? <Spec label="Engine" value={v.engine} wide /> : null}
          {v.horsepower != null ? <Spec label="Horsepower" value={num(v.horsepower, " hp")} /> : null}
          {efficiency(v) !== NA ? <Spec label="Efficiency" value={efficiency(v)} /> : null}
          {v.drivetrain ? <Spec label="Drivetrain" value={v.drivetrain} /> : null}
          {v.seating != null ? <Spec label="Seats" value={num(v.seating)} /> : null}
        </dl>

        <div className="mt-auto flex items-end justify-end gap-3 border-t border-line pt-4">
          <button
            onClick={() => compare.toggle(v.id)}
            disabled={blocked}
            aria-pressed={inCompare}
            title={blocked ? `You can compare up to ${COMPARE_LIMIT} vehicles` : undefined}
            className={cn(
              "chip",
              inCompare ? "border-ink bg-ink text-white" : "border-line hover:border-ink",
              blocked && "cursor-not-allowed opacity-40"
            )}
          >
            {inCompare ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {inCompare ? "Comparing" : "Compare"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("font-medium", value === NA && "text-muted/70 font-normal")}>{value}</dd>
    </div>
  );
}
