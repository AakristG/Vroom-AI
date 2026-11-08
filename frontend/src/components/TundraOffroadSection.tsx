import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { heroPoster } from "../media/heroClips";
import { Reveal } from "./ui/motion";

/**
 * Mid-page Tundra capability band.
 * Specs stay unlabeled — this is a representative image, not a verified trim sheet.
 */
export function TundraOffroadSection() {
  return (
    <section className="relative isolate overflow-hidden bg-charcoal text-white" aria-labelledby="tundra-offroad-heading">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-24 md:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 lg:py-28">
        <Reveal>
          <p className="eyebrow text-signal">Tundra · off-road capability</p>
          <h2 id="tundra-offroad-heading" className="section-title mt-4 max-w-[16ch] text-white">
            Built to leave the pavement.
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
            This is a representative image of the Toyota Tundra TRD Pro, not a verified trim photo. Sign in to browse
            the current lineup with NHTSA model data.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Full-size truck", "TRD Pro", "Off-road ready"].map((item) => (
              <li key={item} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/75">
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/vehicles?q=Tundra" className="btn-primary">
              Explore the Tundra <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/vehicles?category=Truck" className="btn-ghost border-white/25 text-white hover:border-white/50 hover:bg-white/10">
              See all trucks
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] border border-white/10 bg-charcoal-2 shadow-[var(--shadow-lift)]">
            <img
              src={heroPoster}
              alt="Toyota Tundra TRD Pro, representative image"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-transparent to-transparent" />
            <p className="absolute bottom-4 left-4 right-4 text-xs font-medium text-white/70">
              
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
