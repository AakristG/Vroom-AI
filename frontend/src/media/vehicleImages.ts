import modelPhotos from "../../public/media/models/manifest.json";

/**
 * Representative category photos in public/media/categories/. They are AI-generated concept images
 * (see LICENSE.txt there), so any UI that shows one must label it as representative, not the exact vehicle.
 *
 * Per-model photos in public/media/models/ are real, freely licensed Wikimedia Commons images; each one
 * must be shown with its author and license credit (see modelImageNote / modelImageLabel).
 */
export type CategoryKey = "sedans" | "suvs" | "trucks" | "hybrids" | "electric" | "minivans" | "sports-cars";

export const CATEGORY_IMAGE: Record<CategoryKey, string> = {
  sedans: "/media/categories/sedans.jpg",
  suvs: "/media/categories/suvs.jpg",
  trucks: "/media/categories/trucks.jpg",
  hybrids: "/media/categories/hybrids.jpg",
  electric: "/media/categories/electric.jpg",
  minivans: "/media/categories/minivans.jpg",
  "sports-cars": "/media/categories/sports-cars.jpg",
};

export const IMAGE_NOTE = "Representative AI-generated image, not the exact vehicle.";

/** Pick the closest representative photo for a catalog record. */
export function categoryKey(category: string | null | undefined, fuel?: string | null): CategoryKey {
  if (fuel === "Electric") return "electric";
  switch (category) {
    case "SUV":
      return "suvs";
    case "Truck":
      return "trucks";
    case "Minivan":
      return "minivans";
    case "Sports car":
      return "sports-cars";
    case "Hatchback":
      return "hybrids";
    default:
      return "sedans";
  }
}

const MODEL_HINTS: [RegExp, CategoryKey][] = [
  [/tundra|tacoma/i, "trucks"],
  [/sienna/i, "minivans"],
  [/supra|gr86|\b86\b|celica|mr2/i, "sports-cars"],
  [/bz/i, "electric"],
  [/prius/i, "hybrids"],
  [/rav4|highlander|4runner|sequoia|land cruiser|venza|c-hr|corolla cross|crown signia|fj/i, "suvs"],
];

interface ModelPhoto {
  names: string[];
  file: string;
  author: string;
  license: string;
  source_page: string;
}

const norm = (s: string) => s.toLowerCase().replace(/toyota/g, "").replace(/[^a-z0-9+]+/g, " ").trim();
const POWERTRAIN = /\b(hybrid|phev|plug in hybrid|plug in|prime)\b/g;

const PHOTO_BY_NAME = new Map<string, ModelPhoto>();
for (const photo of Object.values(modelPhotos as Record<string, ModelPhoto>)) {
  for (const name of photo.names) {
    if (!PHOTO_BY_NAME.has(norm(name))) PHOTO_BY_NAME.set(norm(name), photo);
  }
}

/** Freely licensed Wikimedia Commons photo of this exact nameplate, if one is bundled. */
export function modelPhoto(model: string): ModelPhoto | null {
  const key = norm(model);
  return PHOTO_BY_NAME.get(key) ?? PHOTO_BY_NAME.get(key.replace(POWERTRAIN, " ").replace(/\s+/g, " ").trim()) ?? null;
}

/** Photo for a model name on a customer account: the real nameplate when available, else category art. */
export function modelImage(model: string) {
  const photo = modelPhoto(model);
  if (photo) return `/media/models/${photo.file}`;
  const hit = MODEL_HINTS.find(([re]) => re.test(model));
  return CATEGORY_IMAGE[hit ? hit[1] : "sedans"];
}

/** Credit / disclaimer to show alongside modelImage(model). */
export function modelImageNote(model: string) {
  const photo = modelPhoto(model);
  return photo
    ? `Representative photo of a Toyota ${photo.names[0]}, not the customer's vehicle. Photo: ${photo.author}, ${photo.license}, via Wikimedia Commons.`
    : IMAGE_NOTE;
}
