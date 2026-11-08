/**
 * Representative category photos in public/media/categories/. They are AI-generated concept images
 * (see LICENSE.txt there), so any UI that shows one must label it as representative, not the exact vehicle.
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

/** Representative photo for a model name on a customer account. */
export function modelImage(model: string) {
  const hit = MODEL_HINTS.find(([re]) => re.test(model));
  return CATEGORY_IMAGE[hit ? hit[1] : "sedans"];
}
