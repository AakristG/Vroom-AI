import { useInView } from "motion/react";
import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getVehicleImage, vehiclePath, type VehicleImage, type VehicleRecord } from "../../api/vehicles";
import { cn } from "../../lib/format";
import { efficiency, msrp, NA, num } from "../../lib/spec";
import { COMPARE_LIMIT, useCompare } from "../../state/compare";
import { SourceBadge } from "../ui/kit";
import { CATEGORY_IMAGE, categoryKey, IMAGE_NOTE } from "../../media/vehicleImages";
import { VehicleArt } from "../VehicleArt";

/** Licensed CarsXE photo when available, otherwise a labeled representative photo for the body style. */
export function VehicleMedia({ v, className, eager = false }: { v: VehicleRecord; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "200px" });
  const [image, setImage] = useState<VehicleImage | null>(v.image);
  const [failed, setFailed] = useState(false);
  const [repFailed, setRepFailed] = useState(false);

  useEffect(() => {
    if (v.source !== "carsxe" || image || !(inView || eager)) return;
    let live = true;
    getVehicleImage(v.year, v.model, v.trim)
      .then((img) => live && setImage(img))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [v, image, inView, eager]);

  return (
    <div ref={ref} className={cn("relative grid place-items-center overflow-hidden bg-gradient-to-b from-[#f1f1ef] to-[#e4e4e1]", className)}>
      {image && !failed ? (
        <>
          <img
            src={image.url}
            alt={`${v.year} Toyota ${v.model}`}
            loading={eager ? "eager" : "lazy"}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
          {image.source_page && (
            <a
              href={image.source_page}
              target="_blank"
              rel="noreferrer noopener"
              className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur hover:bg-black/70"
              title={image.license_note}
            >
              Image source
            </a>
          )}
        </>
      ) : repFailed ? (
        <VehicleArt category={v.category} className="w-[82%] transition-transform duration-700 ease-[var(--ease-premium)] group-hover:translate-x-2" />
      ) : (
        <>
          <img
            src={CATEGORY_IMAGE[categoryKey(v.category, v.fuel_type)]}
            alt={`Representative ${v.category.toLowerCase()} image for the ${v.year} Toyota ${v.model}`}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setRepFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-premium)] group-hover:scale-[1.03]"
          />
          <span title={IMAGE_NOTE} className="absolute bottom-2 left-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-ink/70 backdrop-blur">
            Representative image
          </span>
        </>
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
              {v.year} · {v.category}
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
          <Spec label="Engine" value={v.engine ?? NA} wide />
          <Spec label="Horsepower" value={num(v.horsepower, " hp")} />
          <Spec label="Efficiency" value={efficiency(v)} />
          <Spec label="Drivetrain" value={v.drivetrain ?? NA} />
          <Spec label="Seats" value={num(v.seating)} />
        </dl>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Original base MSRP</div>
            <div className="text-lg font-semibold">{msrp(v)}</div>
          </div>
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
