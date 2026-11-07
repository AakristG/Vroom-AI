import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Layered night skyline (a loose DFW silhouette — Reunion-style ball tower on the right) with
 * a road and tail-light trails. Layers drift at different speeds on scroll for depth, like the
 * HackUTD site's parallax city.
 */
export function Skyline() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const back = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 60]);
  const front = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 25]);
  const moon = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 110]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* sky */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_0%,#26336a_0%,#0d1530_60%)]" />
      {/* stars */}
      <svg className="absolute inset-0 h-full w-full opacity-60">
        {Array.from({ length: 40 }).map((_, i) => (
          <circle key={i} cx={`${(i * 37) % 100}%`} cy={`${(i * 53) % 45}%`} r={i % 5 === 0 ? 1.2 : 0.7} fill="#fff" />
        ))}
      </svg>
      <motion.div style={{ y: moon }} className="absolute right-[12%] top-[10%] hidden h-20 w-20 sm:block rounded-full bg-[#f6efd9] shadow-[0_0_80px_20px_rgba(246,239,217,0.18)]" />

      {/* back buildings */}
      <motion.svg style={{ y: back }} viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" className="absolute bottom-24 h-[42%] w-full">
        <path
          fill="#1b2756"
          d="M0 320V210h60v-40h50v60h40V150h70v80h40v-50h60v90h50V120h30l10-30 10 30h30v130h60v-70h80v100h40V160h90v120h50v-80h60v110h40V140h70v170h50v-90h70v100h60V180h80v140z"
        />
      </motion.svg>

      {/* front buildings + ball tower */}
      <motion.svg style={{ y: front }} viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" className="absolute bottom-24 h-[34%] w-full">
        <g fill="#111a3d">
          <path d="M0 320V240h90v-50h70v130h40V200h60v120h80V170h50v-30h20v30h40v150h60V230h90v90h50V190h70v130h60V210h60v110h70V160h80v160h50V250h70v70h80V220h90v100z" />
          {/* ball tower */}
          <rect x="1180" y="120" width="10" height="200" />
          <circle cx="1185" cy="110" r="26" />
        </g>
        {/* lit windows */}
        <g fill="#f4b23e" opacity="0.55">
          {[
            [110, 210], [130, 230], [300, 220], [320, 250], [420, 190], [440, 230], [600, 250],
            [760, 220], [780, 260], [930, 240], [1010, 190], [1030, 230], [1270, 250], [1300, 270],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="8" height="10" />
          ))}
        </g>
        <g fill="#f4b23e" opacity="0.85">
          {Array.from({ length: 12 }).map((_, i) => (
            <circle key={i} cx={1185 + 22 * Math.cos((i / 12) * Math.PI * 2)} cy={110 + 22 * Math.sin((i / 12) * Math.PI * 2)} r="2" />
          ))}
        </g>
      </motion.svg>

      {/* scrim so copy stays readable over the buildings */}
      <div className="absolute inset-0 bg-gradient-to-r from-night/85 via-night/40 to-transparent" />

      {/* road */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[#0a1026]">
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
        <div className="absolute inset-x-0 top-1/2 h-[2px] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.25)_0_40px,transparent_40px_90px)]" />
        <div className="trail absolute top-[30%] h-[3px] w-1/2 rounded-full bg-gradient-to-r from-transparent via-signal to-transparent blur-[1px]" />
        <div className="trail-late absolute top-[70%] h-[2px] w-1/3 rounded-full bg-gradient-to-r from-transparent via-sodium to-transparent blur-[1px]" />
      </div>
    </div>
  );
}
