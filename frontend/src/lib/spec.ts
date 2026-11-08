import type { VehicleRecord } from "../api/vehicles";

export const NA = "Not available";

export const num = (n: number | null | undefined, unit = "") => (n == null ? NA : `${n.toLocaleString("en-US")}${unit}`);

export const msrp = (v: VehicleRecord) =>
  v.msrp.value == null ? NA : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v.msrp.value);

export function mpgRange(lo: number | null | undefined, hi?: number | null, unit = " mpg") {
  if (lo == null) return NA;
  if (hi != null && hi !== lo) return `${lo}–${hi}${unit}`;
  return `${lo}${unit}`;
}

export function efficiency(v: VehicleRecord) {
  if (v.fuel_type === "Electric") return v.mpge ? `${v.mpge} MPGe` : NA;
  return mpgRange(v.mpg.combined, v.mpg.combined_high, " mpg combined");
}

export const vehicleName = (v: { year: number; model: string; trim: string | null }) => `${v.year} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;

export const categoryLabel = (v: { category: string | null }) => v.category || "Unclassified";

/** Score used for sorting by efficiency: MPGe for EVs, combined MPG otherwise. */
export const efficiencyScore = (v: VehicleRecord) => (v.fuel_type === "Electric" ? v.mpge : v.mpg.combined) ?? null;
