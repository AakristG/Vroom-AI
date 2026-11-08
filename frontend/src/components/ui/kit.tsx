import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { DataSource } from "../../api/vehicles";
import { cn } from "../../lib/format";
import { EASE } from "./motion";

export function PageIntro({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <section data-dark-top className="relative overflow-hidden bg-charcoal pt-16 text-white md:pt-[72px]">
      <div aria-hidden className="absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-signal/20 blur-[120px]" />
      <div aria-hidden className="grain absolute inset-0 opacity-[0.06] mix-blend-overlay" />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-5 py-14 md:px-8 md:py-20">
        <motion.div initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 max-w-[20ch] text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">{title}</h1>
          {children && <div className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">{children}</div>}
        </motion.div>
        {aside}
      </div>
    </section>
  );
}

export function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-go/10 px-2.5 py-1 text-[11px] font-semibold text-go", className)}>
      <Database className="h-3 w-3" /> NHTSA
    </span>
  );
}

export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-sodium/20 px-2.5 py-1 text-[11px] font-semibold text-caution", className)}>
      Simulated account
    </span>
  );
}

export function SourceBanner({ source, fallbackReason }: { source: DataSource; fallbackReason?: string | null }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <SourceBadge source={source} /> Model list from NHTSA vPIC. Photos from Wikimedia Commons (representative; generation may differ). Fuel economy on vehicle pages from EPA FuelEconomy.gov.
      {fallbackReason ? ` ${fallbackReason}` : ""}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-black/[0.06]", className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 p-6">
      <AlertTriangle className="h-5 w-5 text-signal" />
      <p className="font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost border-line px-4 py-2">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
