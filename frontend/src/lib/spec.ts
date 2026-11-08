import type { VehicleRecord } from "../api/vehicles";

export const NA = "Not available";

export const num = (n: number | null | undefined, unit = "") => (n == null ? NA : `${n.toLocaleString("en-US")}${unit}`);

export const msrp = (v: VehicleRecord) =>
  v.msrp.value == null ? NA : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v.msrp.value);

export function efficiency(v: VehicleRecord) {
  if (v.fuel_type === "Electric") return v.mpge ? `${v.mpge} MPGe` : NA;
  return v.mpg.combined ? `${v.mpg.combined} mpg combined` : NA;
}

export const vehicleName = (v: { year: number; model: string; trim: string | null }) => `${v.year} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;

/** Score used for sorting by efficiency: MPGe for EVs, combined MPG otherwise. */
export const efficiencyScore = (v: VehicleRecord) => (v.fuel_type === "Electric" ? v.mpge : v.mpg.combined) ?? null;
