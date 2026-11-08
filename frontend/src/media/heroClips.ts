/**
 * Hero video sequence. Drop licensed clips into frontend/public/media/hero/ using these names
 * (see public/media/hero/README.md). Missing files are skipped; with none present the hero
 * shows its animated fallback scene.
 */
export interface HeroClip {
  label: string;
  webm?: string;
  mp4?: string;
  poster?: string;
}

export const heroClips: HeroClip[] = [
  { label: "Sedan on a coastal highway", webm: "/media/hero/sedan.webm", mp4: "/media/hero/sedan.mp4" },
  { label: "SUV through the hills", webm: "/media/hero/suv.webm", mp4: "/media/hero/suv.mp4" },
  { label: "Truck on an open road", webm: "/media/hero/truck.webm", mp4: "/media/hero/truck.mp4" },
  { label: "Hybrid through the city", webm: "/media/hero/hybrid.webm", mp4: "/media/hero/hybrid.mp4" },
];

export const heroPoster = "/media/hero/poster.jpg";
