/**
 * Hero video sequence. Drop the licensed footage into frontend/public/media/hero/ using these names
 * (see public/media/hero/README.md). Missing files are skipped; with none present the hero shows the
 * poster still, or its built-in scene if the poster is missing too.
 */
export interface HeroClip {
  label: string;
  webm?: string;
  mp4?: string;
}

export const heroClips: HeroClip[] = [
  {
    label: "Toyota Tundra TRD Pro · golden hour",
    webm: "/media/hero/tundra-trd-pro.webm",
    mp4: "/media/hero/tundra-trd-pro.mp4",
  },
];

export const heroPoster = "/media/hero/tundra-trd-pro-poster.jpg";
