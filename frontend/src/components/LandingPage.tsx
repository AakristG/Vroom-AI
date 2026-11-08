import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, MessageCircle, Phone, Shield, Sparkles } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { profiles } from "../data/types";
import { cn, money } from "../lib/format";
import { heroClips } from "../media/heroClips";
import { CATEGORY_IMAGE, IMAGE_NOTE, modelImage, type CategoryKey } from "../media/vehicleImages";
import { useAuth } from "../state/auth";
import { useAssistant, usePageContext } from "../state/assistant";
import { CountUp, EASE, Parallax, Reveal, Stagger, StaggerItem } from "./ui/motion";
import { VideoHero } from "./VideoHero";
import { TundraOffroadSection } from "./TundraOffroadSection";

const steps = [
  {
    n: "01",
    title: "Sign in to your account",
    body: "We open the Toyota you already have: the vehicle, the loan or lease, the payment, and what is left on the contract.",
  },
  {
    n: "02",
    title: "Tell us what changed",
    body: "A new job, a smaller paycheck, a baby, a move, a lease that is ending. If we do not have it on your account, we only use what you choose to tell us.",
  },
  {
    n: "03",
    title: "Read the real options",
    body: "Each choice shows the new payment, what you would pay now, what it costs over the contract, and whether you even qualify.",
  },
  {
    n: "04",
    title: "You decide",
    body: "You can do it yourself, ask a specialist to look first, or leave everything as it is. Nothing is submitted until you say so.",
  },
];

const categories: { label: string; key: CategoryKey; query: string; blurb: string; models: string[] }[] = [
  { label: "Sedans", key: "sedans", query: "category=Sedan", blurb: "Efficient daily drivers with room for five.", models: ["Camry", "Corolla", "Crown"] },
  { label: "SUVs", key: "suvs", query: "category=SUV", blurb: "Space, all-weather confidence, and a higher seat.", models: ["RAV4", "Highlander", "4Runner", "Grand Highlander"] },
  { label: "Trucks", key: "trucks", query: "category=Truck", blurb: "Built to tow, haul, and leave the pavement.", models: ["Tacoma", "Tundra"] },
  { label: "Hybrids", key: "hybrids", query: "fuel=Hybrid", blurb: "Lower fuel costs without changing how you drive.", models: ["Prius", "Camry", "RAV4 Hybrid", "Sienna"] },
  { label: "Electric", key: "electric", query: "fuel=Electric", blurb: "Zero tailpipe emissions and charging at home.", models: ["bZ4X"] },
  { label: "Minivans", key: "minivans", query: "category=Minivan", blurb: "Sliding doors, three rows, and standard hybrid power.", models: ["Sienna"] },
  { label: "Sports cars", key: "sports-cars", query: "category=Sports car", blurb: "Rear-wheel drive and a reason to take the long way.", models: ["GR86", "GR Supra"] },
];

const byId = (id: string) => profiles.find((p) => p.customer.customer_id === id)!;
const journeys = [
  { p: byId("C002"), tag: "Payment difficulty", line: "Hours were cut. The next payment is the worry." },
  { p: byId("C003"), tag: "Lease ending", line: "Three months left and more miles than planned." },
  { p: byId("C004"), tag: "Vehicle comparison", line: "Wants a bigger truck without overpaying." },
  { p: byId("C009"), tag: "Maintenance & safety", line: "An open recall comes before anything financial." },
];

const optionCount = profiles.reduce((n, p) => n + p.options.length, 0);
const stepTypes = new Set(profiles.map((p) => p.golden.next_step_type));
const lines = ["What's the smartest", "next move for you", "and your Toyota?"];

/** Arrow-key navigation for a tablist; returns the next index. */
function tabKey(e: KeyboardEvent, index: number, count: number) {
  const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (next === undefined) return null;
  e.preventDefault();
  return (index + next + count) % count;
}

export function LandingPage() {
  usePageContext("home");
  const { profile } = useAuth();
  const { setOpen } = useAssistant();
  const reduce = useReducedMotion();
  const optionsHref = profile ? "/insights" : "/signin?next=/insights";

  const rise = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0.2 : 0.7, ease: EASE, delay: reduce ? 0 : delay },
  });

  const journey = [
    { n: "01", q: "What Toyota fits my needs?", to: "/vehicles", cta: "Explore vehicles" },
    { n: "02", q: "What can I realistically afford?", to: profile ? "/insights#simulator" : "/signin?next=/insights%23simulator", cta: "Try the payment simulator" },
    { n: "03", q: "What's my smartest move?", to: null, cta: "Ask Toyota AI" },
  ];

  return (
    <main>
      <VideoHero clips={heroClips}>
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-[max(7rem,16svh)] md:px-8">
          <motion.p {...rise(0.05)} className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/85">
            <span className="h-px w-8 bg-signal" /> Toyota Financial Services
          </motion.p>
          <h1 className="mt-5 max-w-[14ch] text-[clamp(2.5rem,min(6.6vw,10svh),5.5rem)] font-semibold leading-[0.98] tracking-[-0.035em] [text-shadow:0_2px_30px_rgba(0,0,0,0.35)]">
            {lines.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  className="block"
                  initial={reduce ? { opacity: 0 } : { y: "105%" }}
                  animate={reduce ? { opacity: 1 } : { y: "0%" }}
                  transition={{ duration: reduce ? 0.2 : 0.85, ease: EASE, delay: reduce ? 0 : 0.12 + i * 0.08 }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p {...rise(0.4)} className="mt-6 max-w-[36ch] text-lg leading-relaxed text-white/85 md:text-xl">
            Your vehicle. Your finances. Your next move. All made simpler with AI.
          </motion.p>
          <motion.div {...rise(0.5)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to={optionsHref} className="btn-primary group px-7 py-3.5 text-base">
              Explore Your Options <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="btn-ghost border-white/30 bg-white/10 px-7 py-3.5 text-base text-white backdrop-blur-md hover:border-white/50 hover:bg-white/20"
            >
              <Sparkles className="h-4 w-4" /> Talk to Toyota AI
            </button>
          </motion.div>

          <motion.nav
            {...rise(0.7)}
            aria-label="Your journey"
            className="mt-14 hidden overflow-hidden rounded-3xl border border-white/15 bg-white/[0.07] backdrop-blur-xl lg:grid lg:grid-cols-3"
          >
            {journey.map((j, i)