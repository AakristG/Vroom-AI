import { apiClient } from "./client";

export type DataSource = "nhtsa";
export type ImageMatch = "exact" | "generation" | "unavailable";

export interface VehicleImage {
  url: string | null;
  thumbnail: string | null;
  views?: Record<string, string>;
  match?: ImageMatch;
  matched_name?: string | null;
  source_page: string | null;
  provider: string;
  license_filter: string | null;
  license_note: string;
  expires_at?: number | null;
}

export interface VehicleRecord {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  style_name: string | null;
  category: string | null;
  vehicle_type?: string | null;
  fuel_type: string | null;
  engine: string | null;
  horsepower: number | null;
  torque_lb_ft: number | null;
  drivetrain: string | null;
  transmission: string | null;
  mpg: { city: number | null; highway: number | null; combined: number | null };
  mpge: number | null;
  ev_range_mi: number | null;
  seating: number | null;
  cargo_cu_ft: number | null;
  dimensions: { length_in: number | null; width_in: number | null; height_in: number | null; wheelbase_in: number | null };
  curb_weight_lb: number | null;
  msrp: { value: number | null; kind: "unavailable" | "historical_base_msrp" };
  monthly_payment?: number | null;
  safety?: string[] | Record<string, unknown>;
  features?: string[];
  spec_groups?: { category: string; items: { name: string; value: string | null }[] }[];
  image: VehicleImage | null;
  image_match?: ImageMatch;
  image_views?: Record<string, string>;
  safety_rating?: number | null;
  safety_rating_available?: boolean;
  recall_count?: number | null;
  recalls?: { count: number | null; note?: string; campaigns?: unknown[] };
  source: DataSource;
  source_note: string;
  sources?: {
    vehicleData: "NHTSA";
    images: "CarImagesAPI" | null;
    safety: "NHTSA" | null;
    recalls: "NHTSA" | null;
  };
}

interface Listing<T> {
  source: DataSource;
  fallback_reason: string | null;
  data: T;
}

export interface CatalogStatus {
  carimages_configured: boolean;
  source: DataSource;
  categories: string[];
  fuel_types: string[];
  default_year: number;
  pricing: string;
  pricing_note: string;
}

const memo = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = load().catch((err) => {
    memo.delete(key);
    throw err;
  });
  memo.set(key, p);
  return p;
}

export function clearVehicleCache() {
  memo.clear();
}

const slow = { timeout: 45000 };

export const vehicleId = (year: number, model: string, trim?: string | null) => `${year}|${model}|${trim ?? ""}`;
export const parseVehicleId = (id: string) => {
  const [year, model, trim] = id.split("|");
  return { year: Number(year), model, trim: trim || null };
};
export const vehiclePath = (v: { year: number; model: string; trim: string | null }) =>
  `/vehicles/${v.year}/${encodeURIComponent(v.model)}${v.trim ? `/${encodeURIComponent(v.trim)}` : ""}`;

export const getCatalogStatus = () =>
  cached("status", async () => (await apiClient.get<CatalogStatus>("/api/vehicles/status/")).data);

export const getYears = () =>
  cached("years", async () => {
    const { data } = await apiClient.get("/api/vehicles/years/", slow);
    return { source: data.source as DataSource, fallback_reason: data.fallback_reason, data: data.years as number[] } as Listing<number[]>;
  });

export const getTrims = (year: number, model: string) =>
  cached(`trims:${year}:${model}`, async () => {
    const { data } = await apiClient.get("/api/vehicles/trims/", { params: { year, model }, ...slow });
    return { source: data.source as DataSource, fallback_reason: data.fallback_reason, data: data.trims as string[] } as Listing<string[]>;
  });

export const getCatalog = (year: number) =>
  cached(`catalog:${year}`, async () => {
    const { data } = await apiClient.get("/api/vehicles/catalog/", { params: { year }, timeout: 120000 });
    return { source: data.source as DataSource, fallback_reason: data.fallback_reason, data: data.vehicles as VehicleRecord[] } as Listing<VehicleRecord[]>;
  });

export const getVehicle = (year: number, model: string, trim?: string | null) =>
  cached(`detail:${vehicleId(year, model, trim)}`, async () => {
    const { data } = await apiClient.get<VehicleRecord>("/api/vehicles/detail/", {
      params: { year, model, trim: trim || undefined },
      ...slow,
    });
    return data;
  });

export const getVehicleImage = (year: number, model: string, trim?: string | null) =>
  cached(`image:${vehicleId(year, model, trim)}`, async () => {
    const { data } = await apiClient.get<{ image: VehicleImage | null }>("/api/vehicles/image/", {
      params: { year, model, trim: trim || undefined },
      ...slow,
    });
    return data.image;
  });

export async function compareVehicles(ids: string[]) {
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("v", id));
  const { data } = await apiClient.get<{ vehicles: VehicleRecord[]; errors: { id: string; detail: string }[] }>(
    `/api/vehicles/compare/?${params.toString()}`,
    { timeout: 60000 }
  );
  return data;
}

export async function decodeVin(vin: string, year?: number) {
  const { data } = await apiClient.post(
    "/api/vehicles/decode-vin/",
    { vin, year: year || undefined },
    { timeout: 30000 }
  );
  return data as {
    vin_last4: string;
    make: string | null;
    model: string | null;
    model_year: number | null;
    body_class: string | null;
    vehicle_type: string | null;
    drive_type: string | null;
    fuel: string | null;
    decode_ok: boolean;
    error_text: string | null;
    source: "NHTSA";
  };
}

export function apiErrorMessage(err: unknown, fallback: string) {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || fallback;
}
