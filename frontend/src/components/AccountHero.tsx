import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { Profile } from "../data/types";
import { modelImage, modelImageNote } from "../media/vehicleImages";
import { EASE } from "./ui/motion";

/** Dark page header for signed-in pages: greeting, the customer's vehicle, and a strip of account figures. */
export function AccountHero({
  p,
  eyebrow,
  title,
  children,
  stats,
  badge = "Simulated account",
}: {
  p: Profile;
  eyebrow: string;
  title: string;
  children?: ReactNode;
  stats: [string, string][];
  badge?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <section data-dark-top className="relative isolate overflow-hidden bg-charcoal pt-16 text-white md:pt-[72px]">
      <img
        src={modelImage(p.vehicle.model)}
        alt=""
        aria-hidden
        title={modelImageNote(p.vehicle.model)}
        className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-60 md:w-[62%] md:opacity-95"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal via-charcoal/90 to-charcoal/20 md:via-charcoal/75" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-charcoal to-transparent" />
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-12 md:px-8 md:pt-16">
        <motion.div initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">{eyebrow}</p>
            <span className="rounded-full bg-sodium/20 px-2.5 py-0.5 text-[11px] font-semibold text-sodium">{badge}</span>
          </div>
          <h1 className="mt-4 text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.03em]">{title}</h1>
          {children && <div className="mt-3 max-w-xl text-lg leading-relaxed text-white/70">{children}</div>}
        </motion.div>
        <motion.dl
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : 0.15 }}
          className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl md:grid-cols-4"
        >
          {stats.map(([label, value]) => (
            <div key={label} className="bg-charcoal/55 p-5">
              <dt className="text-xs text-white/55">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{value}</dd>
            </div>
          ))}
        </motion.dl>
        <p className="mt-3 text-right text-[10px] text-white/40">Vehicle photo: representative AI-generated image</p>
      </div>
    </section>
  );
}
