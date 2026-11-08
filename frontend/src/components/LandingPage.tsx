import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, MessageCircle, Phone, Shield, Sparkles } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { profiles } from "../data/types";
import { cn, money } from "../lib/format";
import { heroClips } from "../media/heroClips";
import { CATEGORY_IMAGE, IMAGE_NOTE, modelImage, type CategoryKey } from "../media/vehicleImages";
import { useAuth } from "../state/auth";
import { useAssistant, usePageContext } from "../state/assistant";
import { CountUp, EASE, Parallax, Reveal, Stagger, StaggerItem } from "./ui/motion";
import { TundraOffroadSection } from "./TundraOffroadSection";
import { VideoHero } from "./VideoHero";

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
  const navigate = useNavigate();
  const talkToAi = () => (profile ? setOpen(true) : navigate("/signin?next=/assistant"));
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
              onClick={talkToAi}
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
            {journey.map((j, i) => {
              const inner = (
                <>
                  <span className="text-xs font-semibold tracking-[0.2em] text-signal">{j.n}</span>
                  <span className="mt-2 block text-lg font-semibold leading-snug">{j.q}</span>
                  <span className="mt-3 flex items-center gap-1.5 text-sm text-white/70 transition-colors duration-150 group-hover:text-white">
                    {j.cta} <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </>
              );
              const cls = cn("group block p-6 text-left transition-colors duration-200 hover:bg-white/[0.08]", i > 0 && "border-l border-white/10");
              return j.to ? (
                <Link key={j.n} to={j.to} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={j.n} onClick={talkToAi} className={cls}>
                  {inner}
                </button>
              );
            })}
          </motion.nav>
        </div>
      </VideoHero>

      <CategoryExplorer />

      <TundraOffroadSection />

      {/* Synthetic scenario, kept from the original landing page */}
      <section id="scenario" className="relative scroll-mt-24 bg-mist">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-20 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <Reveal>
            <p className="eyebrow">A real kind of moment</p>
            <h2 className="section-title mt-4 max-w-[18ch]">Help with the Toyota you already drive.</h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Tell us what is going on. We look at your financing agreement, explain the options that actually apply, and let you choose.
              We will not talk you into a car, and we will not change your contract for you.
            </p>
            <div className="mt-8 grid max-w-xl gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              {[
                ["Your contract", "Loan, lease, or neither."],
                ["Plain costs", "Payment, upfront, and total."],
                ["Your say-so", "We explain. You authorize."],
              ].map(([title, body]) => (
                <div key={title} className="bg-mist p-4">
                  <div className="text-sm font-semibold">{title}</div>
                  <p className="mt-1 text-xs text-muted">{body}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <aside className="card relative overflow-hidden p-6 md:p-8" style={{ boxShadow: "var(--shadow-lift)" }}>
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-signal/10 blur-3xl" aria-hidden />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Example · synthetic account</p>
                <span className="rounded-full bg-sodium/20 px-2.5 py-1 text-[11px] font-semibold text-caution">Simulated</span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">A payment that got harder to make</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Hours were cut. The Camry payment is still $602. Here is what we would put on the table — and what we would not promise.
              </p>
              <dl className="mt-6 space-y-3 text-sm">
                <Row label="Keep the loan" value="$602/mo" note="No change" />
                <Row label="Extend 12 months" value="$474/mo" note="Lower now, about $820 more interest later" accent />
                <Row label="Skip one payment" value="Needs a person" note="About $125 interest may be added. Not a guarantee." />
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-muted">
                Refinance is not offered here because of a recent missed payment. Sign in to see the numbers on your own agreement.
              </p>
            </aside>
          </Reveal>
        </div>
      </section>

      {/* Stats, counted from the synthetic data pack */}
      <section className="relative overflow-hidden bg-charcoal text-white">
        <Parallax className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-signal/20 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
          {[
            { value: profiles.length, label: "customer situations modeled", note: "Synthetic accounts" },
            { value: optionCount, label: "options checked against eligibility", note: "From the data pack" },
            { value: stepTypes.size, label: "kinds of next step", note: [...stepTypes].join(", ") },
            { value: 0, label: "contract changes without your say-so", note: "Every step needs consent" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="text-5xl font-semibold tracking-tight md:text-6xl">
                <CountUp value={s.value} />
              </div>
              <div className="mt-2 text-sm text-white/80">{s.label}</div>
              <div className="mt-1 text-xs text-white/40">{s.note}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <PersonaSelector />

      <section id="how" className="relative mx-auto max-w-7xl scroll-mt-24 overflow-hidden px-5 py-24 md:px-8">
        <Parallax className="pointer-events-none absolute right-0 top-10 h-80 w-80 rounded-full bg-signal/10 blur-3xl" />
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="section-title mt-4 max-w-[18ch]">This is for a change in your life, not a sales pitch.</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Payment trouble, a lease that is ending, a car that no longer fits — you get the choices that belong to your agreement.
          </p>
        </Reveal>
        <Stagger className="relative mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <StaggerItem key={s.n}>
              <div className="card card-hover h-full p-7">
                <div className="text-4xl font-semibold tracking-tight text-signal/90">{s.n}</div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section id="numbers" className="bg-paper py-24">
        <div className="mx-auto grid max-w-7xl items-start gap-10 px-5 md:px-8 lg:grid-cols-2">
          <Reveal>
            <h2 className="section-title">We start from your account. We do not guess the rest.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Toyota Financial Services already has your vehicle and your contract. It does not automatically know that your pay changed, what your rent
              is, or what you owe on other cards. You can tell us those things. You do not have to connect another bank.
            </p>
          </Reveal>
          <Stagger className="grid gap-4 sm:grid-cols-2">
            <StaggerItem>
              <InfoCard title="Already on your account" items={["Who you are", "Your Toyota", "Monthly payment", "Balance or residual", "Due date and maturity", "Loan or lease"]} />
            </StaggerItem>
            <StaggerItem>
              <InfoCard title="Only if you tell us" items={["Pay went up or down", "A new child", "A move", "Rent and other bills", "What you want to do next"]} />
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section id="promise" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Reveal>
            <h2 className="section-title">What we will not do.</h2>
            <ul className="mt-7 space-y-4">
              {[
                "We will not say you qualify before your agreement is checked.",
                "We will not invent a discount or a lower payment.",
                "We will not pull a credit report because money feels tight.",
                "We will not change a due date, defer a payment, or start a refinance until you authorize it.",
                "If the financing is not with Toyota, we will say so instead of offering Toyota programs that do not apply.",
              ].map((line) => (
                <li key={line} className="flex gap-3 leading-relaxed">
                  <Shield className="mt-0.5 h-5 w-5 shrink-0 text-signal" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative overflow-hidden rounded-3xl bg-charcoal p-8 text-white md:p-10">
              <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-signal/25 blur-[80px]" aria-hidden />
              <MessageCircle className="h-6 w-6 text-signal" />
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">Talk it through, by phone or here.</h3>
              <p className="mt-3 leading-relaxed text-white/75">
                Say what changed in your own words. If a dollar amount matters, we read it back before we use it — a misheard $500 and $5,000 should not
                change your options.
              </p>
              <div className="mt-6 flex items-center gap-3 text-sm text-white/70">
                <Phone className="h-4 w-4" />
                You can call, or sign in and review everything on the page first.
              </div>
              <button onClick={talkToAi} className="btn-primary relative mt-7">
                <Sparkles className="h-4 w-4" /> Ask Toyota NextMove AI
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-charcoal text-white">
        <img src="/media/hero/tundra-trd-pro-poster.jpg" alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal via-charcoal/80 to-charcoal/30" />
        <Reveal className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-24 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <h2 className="section-title">Look at your own agreement.</h2>
            <p className="mt-3 max-w-xl text-white/70">
              Demo sign-in uses fictional Toyota Financial Services customers. After you sign in, you only see that one account.
            </p>
          </div>
          <Link to={optionsHref} className="btn-primary">
            Find My Next Move <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>
    </main>
  );
}

function CategoryExplorer() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const c = categories[active];

  const select = (i: number) => {
    setActive(i);
    tabs.current[i]?.focus();
  };

  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Explore vehicles</p>
            <h2 className="section-title mt-4 max-w-[20ch]">Every Toyota, with the numbers that matter.</h2>
          </div>
          <Link to="/vehicles" className="group inline-flex items-center gap-2 text-sm font-semibold">
            Browse the lineup <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <Reveal delay={0.05} className="mt-10 grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div role="tablist" aria-label="Vehicle categories" aria-orientation="vertical" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
            {categories.map((cat, i) => (
              <button
                key={cat.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`cat-tab-${cat.key}`}
                aria-selected={active === i}
                aria-controls="cat-panel"
                tabIndex={active === i ? 0 : -1}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onKeyDown={(e) => {
                  const next = tabKey(e, i, categories.length);
                  if (next !== null) select(next);
                }}
                className={cn(
                  "relative flex shrink-0 items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-200",
                  active === i ? "text-white" : "text-ink/70 hover:bg-mist hover:text-ink"
                )}
              >
                {active === i && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-2xl bg-ink" transition={{ duration: 0.3, ease: EASE }} />}
                <span className="relative">{cat.label}</span>
                <ArrowRight className={cn("relative hidden h-4 w-4 transition-opacity duration-200 lg:block", active === i ? "opacity-100" : "opacity-0")} />
              </button>
            ))}
          </div>

          <div
            id="cat-panel"
            role="tabpanel"
            aria-labelledby={`cat-tab-${c.key}`}
            className="relative isolate min-h-[22rem] overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#efeeec] to-[#dcdbd7] md:min-h-[30rem]"
          >
            <AnimatePresence initial={false}>
              <motion.img
                key={c.key}
                src={CATEGORY_IMAGE[c.key]}
                alt={`Representative Toyota ${c.label.toLowerCase()} image`}
                title={IMAGE_NOTE}
                initial={{ opacity: 0, scale: 1.04, x: 24 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0 -z-10 h-full w-full object-cover"
              />
            </AnimatePresence>
            <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-charcoal/90 via-charcoal/40 to-transparent" />
            <span className="absolute right-4 top-4 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-ink/70 backdrop-blur">Representative AI image</span>

            <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={c.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
                  <h3 className="text-3xl font-semibold tracking-tight md:text-5xl">{c.label}</h3>
                  <p className="mt-2 max-w-md text-white/80">{c.blurb}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {c.models.map((m) => (
                      <Link
                        key={m}
                        to={`/vehicles?q=${encodeURIComponent(m)}`}
                        className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-sm font-medium backdrop-blur-md transition-colors duration-150 hover:bg-white hover:text-ink"
                      >
                        {m}
                      </Link>
                    ))}
                    <Link to={`/vehicles?${c.query}`} className="btn-primary ml-auto px-5 py-2.5">
                      See all {c.label.toLowerCase()} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PersonaSelector() {
  const { profile } = useAuth();
  const signedIndex = journeys.findIndex((j) => j.p.customer.customer_id === profile?.customer.customer_id);
  const [active, setActive] = useState(signedIndex >= 0 ? signedIndex : 0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const { p, tag, line } = journeys[active];
  const a = p.account;
  const current = profile?.customer.customer_id === p.customer.customer_id;

  return (
    <section className="relative overflow-hidden bg-charcoal text-white">
      <div aria-hidden className="absolute -right-40 top-20 h-[30rem] w-[30rem] rounded-full bg-signal/15 blur-[140px]" />
      <div className="relative mx-auto max-w-7xl px-5 py-24 md:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Built around today</p>
            <h2 className="section-title mt-4 max-w-[22ch]">The page changes with your situation.</h2>
            <p className="mt-4 max-w-2xl text-lg text-white/65">
              Pick one of these fictional customers to see how the dashboard and assistant adapt. Their accounts are simulated.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div role="tablist" aria-label="Demo customers" className="mt-10 grid grid-cols-2 gap-2 md:grid-cols-4">
            {journeys.map((j, i) => {
              const signed = profile?.customer.customer_id === j.p.customer.customer_id;
              return (
                <button
                  key={j.p.customer.customer_id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  aria-selected={active === i}
                  aria-controls="persona-panel"
                  tabIndex={active === i ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    const next = tabKey(e, i, journeys.length);
                    if (next !== null) {
                      setActive(next);
                      tabs.current[next]?.focus();
                    }
                  }}
                  className={cn(
                    "relative flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors duration-200",
                    active === i ? "border-white/30 bg-white/10" : "border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                  )}
                >
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", active === i ? "bg-signal" : "bg-white/10")}>
                    {j.p.customer.first_name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {j.p.customer.first_name}
                      {signed && <Check className="h-3.5 w-3.5 text-signal" aria-label="signed in" />}
                    </span>
                    <span className="block truncate text-xs text-white/55">{j.tag}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div id="persona-panel" role="tabpanel" className="mt-4 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={p.customer.customer_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="grid lg:grid-cols-[1.05fr_0.95fr]"
              >
                <div className="p-6 md:p-10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-signal">{tag}</span>
                    <span className="rounded-full bg-sodium/20 px-2.5 py-1 text-[11px] font-semibold text-sodium">{current ? "Signed in · simulated" : "Simulated account"}</span>
                  </div>
                  <p className="mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">“{line}”</p>
                  <p className="mt-3 text-white/60">
                    {p.customer.first_name} · {p.customer.city}, {p.customer.state}
                  </p>
                  <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-4">
                    {[
                      ["Vehicle", `${p.vehicle.model_year} ${p.vehicle.model}`],
                      ["Financing", a.contract_type === "lease" ? "Lease" : "Loan"],
                      ["Payment", `${money(a.monthly_payment)}/mo`],
                      ["Months left", String(a.months_remaining)],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-charcoal/60 p-4">
                        <dt className="text-xs text-white/50">{k}</dt>
                        <dd className="mt-1 font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-6 text-sm text-white/65">
                    <span className="font-semibold text-white">Suggested next move:</span> {p.golden.best_next_move}
                  </p>
                  <Link to="/signin?next=/insights" className="btn-primary mt-8">
                    {current ? "Open my insights" : `Sign in as ${p.customer.first_name}`} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="relative min-h-[16rem] bg-gradient-to-b from-[#efeeec] to-[#d9d8d4]">
                  <img src={modelImage(p.vehicle.model)} alt={`Representative image of a Toyota ${p.vehicle.model}`} title={IMAGE_NOTE} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute bottom-4 right-4 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-ink/70 backdrop-blur">Representative AI image</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Row({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,1fr)_auto] items-start gap-4 border-b border-line pb-3 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        <div className={accent ? "font-semibold text-signal" : "font-semibold"}>{value}</div>
        <div className="max-w-[16rem] text-xs text-muted">{note}</div>
      </dd>
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="h-full rounded-3xl border border-line bg-mist p-6">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
