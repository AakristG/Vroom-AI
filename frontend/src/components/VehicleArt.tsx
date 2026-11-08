import { useId } from "react";

/** Original side-profile silhouettes per body style, used whenever no licensed photo is available. */
const SHAPES: Record<string, { body: string; glass: string; wheels: [number, number]; ground: number }> = {
  Sedan: {
    body: "M20 100L30 80Q60 72 110 68L150 45Q170 38 230 38Q270 40 300 66L360 74Q385 78 385 95V104Q385 108 380 108H20Z",
    glass: "M162 50Q178 45 228 45Q256 47 278 66H150Z",
    wheels: [95, 312],
    ground: 108,
  },
  Hatchback: {
    body: "M20 102L28 82Q60 72 110 66L150 40Q165 32 220 32Q265 34 300 44L330 70Q372 76 380 92V104Q380 108 375 108H20Z",
    glass: "M160 44Q172 38 220 38Q258 40 290 50L314 66H148Z",
    wheels: [92, 305],
    ground: 108,
  },
  SUV: {
    body: "M18 104L22 74Q26 62 60 60L110 58L140 30Q148 24 170 24H300Q320 24 335 40L352 60Q385 66 388 84V104Q388 110 382 110H18Z",
    glass: "M150 34H298Q312 34 322 46L334 58H130Z",
    wheels: [92, 316],
    ground: 110,
  },
  Truck: {
    body: "M15 106V80Q15 70 30 68H120L150 34Q155 28 165 28H235Q245 28 248 38V68H385V100Q385 108 378 108H15Z",
    glass: "M160 38H238V62H136Z",
    wheels: [86, 320],
    ground: 108,
  },
  Minivan: {
    body: "M18 104V70Q20 52 50 46L120 26Q130 22 150 22H320Q345 22 360 46L380 72Q388 80 388 92V104Q388 110 382 110H18Z",
    glass: "M134 30H316Q336 30 346 48L356 62H96Z",
    wheels: [90, 318],
    ground: 110,
  },
  "Sports car": {
    body: "M15 102Q20 86 60 80L140 70Q180 46 230 44Q280 44 320 70L370 78Q392 82 392 96V102Q392 106 386 106H15Z",
    glass: "M172 56Q200 49 232 49Q268 51 294 68H152Z",
    wheels: [88, 322],
    ground: 106,
  },
};

export function VehicleArt({ category, className, tone = "light" }: { category: string; className?: string; tone?: "light" | "dark" }) {
  const shape = SHAPES[category] ?? SHAPES.Sedan;
  const id = useId().replace(/:/g, "");
  const dark = tone === "dark";
  return (
    <svg viewBox="0 0 400 130" className={className} role="img" aria-label={`${category} illustration`}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dark ? "#4a4d55" : "#2b2d33"} />
          <stop offset="0.55" stopColor={dark ? "#26282d" : "#16171a"} />
          <stop offset="1" stopColor="#0c0d0f" />
        </linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fb3c8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#3a4654" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="200" cy={shape.ground + 6} rx="190" ry="9" fill={`url(#s${id})`} />
      <path d={shape.body} fill={`url(#b${id})`} />
      <path d={shape.glass} fill={`url(#g${id})`} />
      <path d={shape.body} fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
      <rect x="360" y="84" width="20" height="5" rx="2.5" fill="#f5f0e1" opacity="0.9" />
      <rect x="20" y="86" width="12" height="5" rx="2.5" fill="#eb0a1e" />
      {shape.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={shape.ground} r="22" fill="#0a0a0b" />
          <circle cx={cx} cy={shape.ground} r="12" fill="#5d626b" />
          <circle cx={cx} cy={shape.ground} r="4" fill="#1c1d20" />
        </g>
      ))}
    </svg>
  );
}
