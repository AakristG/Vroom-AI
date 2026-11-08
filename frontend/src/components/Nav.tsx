import { Phone } from "lucide-react";

export function Nav({ backendOk }: { backendOk: boolean | null }) {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 text-white md:px-8">
        <a href="#top" className="flex items-baseline gap-3">
          <span className="font-display text-3xl leading-none tracking-wide">
            Next<span className="text-signal">/</span>Move
          </span>
          <span className="hidden text-xs text-white/60 sm:inline">a Toyota Financial Services concept</span>
        </a>
        <div className="flex items-center gap-1 text-sm md:gap-2">
          <a className="hidden rounded-full px-3 py-2 text-white/75 hover:text-white md:inline" href="#console">
            Console
          </a>
          <a className="hidden rounded-full px-3 py-2 text-white/75 hover:text-white md:inline" href="#how">
            How it works
          </a>
          <a className="hidden rounded-full px-3 py-2 text-white/75 hover:text-white md:inline" href="#value">
            Business value
          </a>
          <span
            title={backendOk === null ? "Checking backend" : backendOk ? "Backend connected" : "Backend unreachable — running on bundled data"}
            className="mx-2 hidden text-xs text-white/60 lg:inline"
          >
            {backendOk === null ? "Checking" : backendOk ? "Live" : "Demo data"}
          </span>
          <a
            href="#console"
            className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 font-medium text-white hover:bg-signal-deep"
          >
            <Phone className="h-4 w-4" /> Start a call
          </a>
        </div>
      </nav>
    </header>
  );
}
