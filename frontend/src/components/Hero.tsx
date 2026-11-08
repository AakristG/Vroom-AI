import { AnimatePresence, motion } from "motion/react";
import { PhoneIncoming } from "lucide-react";
import { useEffect, useState } from "react";
import { profiles } from "../data/types";
import { Skyline } from "./Skyline";

const featured = ["C002", "C003", "C007", "C001", "C010"].map((id) => profiles.find((p) => p.customer.customer_id === id)!);

export function Hero({ onTakeCall }: { onTakeCall: (id: string) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % featured.length), 6000);
    return () => clearInterval(t);
  }, []);
  const p = featured[i];

  return (
    <section id="top" className="relative isolate min-h-[92vh] overflow-hidden bg-night text-white">
      <Skyline />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-5 pb-44 pt-32 md:px-8 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:pt-40">
        <div className="relative">
          <h1 className="font-display text-[clamp(3.25rem,7vw,6.75rem)] leading-[0.88] tracking-[0.01em]">
            Given my situation today, what's my smartest next move?
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-white/75">
            Call in and say what changed. A Nemotron agent reads your loan or lease, checks only the options you
            actually qualify for, explains the trade-offs in plain language, and hands you one clear next step.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => onTakeCall(p.customer.customer_id)}
              className="rounded-full bg-signal px-6 py-3 font-medium hover:bg-signal-deep"
            >
              Open the console
            </button>
            <a href="#how" className="rounded-full border border-white/25 bg-night/60 px-6 py-3 font-medium backdrop-blur hover:bg-white/10">
              See how it decides
            </a>
          </div>
        </div>

        {/* Incoming call card cycles real situations from the data pack */}
        <div className="relative">
          <div className="rounded-2xl border border-white/10 bg-night-2/80 p-6 backdrop-blur-md shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]">
            <div className="flex items-center justify-between text-sm text-white/60">
              <span>Incoming call</span>
              <span>Synthetic customer</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={p.customer.customer_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <p className="mt-5 text-xl leading-snug text-white">“{p.situation.customer_says}”</p>
                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                  <div>
                    <div className="font-medium">
                      {p.customer.first_name}, {p.customer.age} — {p.customer.city}
                    </div>
                    <div className="text-white/60">
                      {p.vehicle.model_year} {p.vehicle.model} {p.vehicle.trim} · {p.account.contract_type}
                    </div>
                  </div>
                  <button
                    onClick={() => onTakeCall(p.customer.customer_id)}
                    className="flex items-center gap-2 rounded-full bg-go px-4 py-2 font-medium hover:brightness-110"
                  >
                    <PhoneIncoming className="h-4 w-4" /> Take call
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {featured.map((f, n) => (
              <button
                key={f.customer.customer_id}
                aria-label={`Show ${f.customer.first_name}'s call`}
                onClick={() => setI(n)}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-white" : "w-1.5 bg-white/30"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
