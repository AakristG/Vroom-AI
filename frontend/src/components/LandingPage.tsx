import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown, MessageCircle, Phone, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { profiles } from "../data/types";
import { heroClips } from "../media/heroClips";
import { useAuth } from "../state/auth";
import { useAssistant, usePageContext } from "../state/assistant";
import { CountUp, EASE, Parallax, Reveal, Stagger, StaggerItem } from "./ui/motion";
import { VehicleArt } from "./VehicleArt";
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

const categories = [
  { label: "Sedans", art: "Sedan", query: "category=Sedan" },
  { label: "SUVs", art: "SUV", query: "category=SUV" },
  { label: "Trucks", art: "Truck", query: "category=Truck" },
  { label: "Hybrids", art: "Hatchback", query: "fuel=Hybrid" },
  { label: "Electric", art: "SUV", query: "fuel=Electric" },
  { label: "Minivans", art: "Minivan", query: "category=Minivan" },
  { label: "Sports cars", art: "Sports car", query: "category=Sports car" },
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

export function LandingPage() {
  usePageContext("home");
  const { profile } = useAuth();
  const { setOpen } = useAssistant();
  const reduce = useReducedMotion();
  const optionsHref = profile ? "/insights" : "/signin?next=/insights";

  const rise = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, ease: EASE, delay },
  });

  return (
    <main>
      <VideoHero clips={heroClips}>
        <div className="mx-auto max-w-7xl px-5 pb-24 pt-[max(7rem,18svh)] md:px-8 md:pb-[max(6rem,14svh)]">
          <motion.p {...rise(0.1)} className="flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
            <span className="h-px w-8 bg-signal" /> Toyota Financial Services
          </motion.p>
          <h1 className="mt-5 max-w-[15ch] text-[clamp(2.5rem,min(7.2vw,11svh),6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
            {lines.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  className="block"
                  initial={reduce ? { opacity: 0 } : { y: "105%" }}
                  animate={reduce ? { opacity: 1 } : { y: "0%" }}
                  transition={{ duration: 1.05, ease: EASE, delay: 0.25 + i * 0.12 }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p {...rise(0.75)} className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 md:text-xl">
            Your vehicle. Your finances. Your next move. All made simpler with AI.
          </motion.p>
          <motion.div {...rise(0.9)} className="mt-9 flex flex-wrap gap-3">
            <Link to={optionsHref} className="btn-primary px-7 py-3.5 text-base">
              Explore Your Options <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="btn-ghost border-white/30 bg-white/10 px-7 py-3.5 text-base text-white backdrop-blur-md hover:bg-white/20"
            >
              <Sparkles className="h-4 w-4" /> Talk to Toyota AI
            </button>
          </motion.div>
        </div>
        <motion.a
          href="#scenario"
          aria-label="Scroll to the example"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 text-white/60 hover:text-white md:block"
        >
          <ChevronDown className="h-6 w-6 motion-safe:animate-bounce" />
        </motion.a>
      </VideoHero>

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

      {/* Vehicle categories */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Explore vehicles</p>
            <h2 className="section-title mt-4 max-w-[20ch]">Every Toyota, with the numbers that matter.</h2>
          </div>
          <Link to="/vehicles" className="group inline-flex items-center gap-2 text-sm font-semibold">
            Browse the lineup <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
        <Stagger className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          {categories.map((c) => (
            <StaggerItem key={c.label}>
              <Link
                to={`/vehicles?${c.query}`}
                className="group card flex h-full flex-col justify-between p-4 transition-[transform,box-shadow] duration-500 ease-[var(--ease-premium)] hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
              >
                <VehicleArt category={c.art} className="w-full transition-transform duration-700 ease-[var(--ease-premium)] group-hover:translate-x-1.5" />
                <span className="mt-3 flex items-center justify-between text-sm font-semibold">
                  {c.label} <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Personalized journeys */}
      <section className="bg-mist">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
          <Reveal>
            <p className="eyebrow">Built around today</p>
            <h2 className="section-title mt-4 max-w-[22ch]">The page changes with your situation.</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              Sign in as one of these fictional customers to see how the dashboard and assistant adapt. Their accounts are simulated.
            </p>
          </Reveal>
          <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {journeys.map(({ p, tag, line }) => (
              <StaggerItem key={p.customer.customer_id}>
                <Link
                  to={`/signin?as=${p.customer.first_name}&next=/insights`}
                  className="group card flex h-full flex-col p-6 transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-signal">{tag}</span>
                  <p className="mt-3 text-lg font-semibold leading-snug tracking-tight">{line}</p>
                  <p className="mt-3 text-sm text-muted">
                    {p.customer.first_name} · {p.vehicle.model_year} {p.vehicle.model} · {p.account.contract_type}
                  </p>
                  <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold">
                    See {p.customer.first_name}'s next move <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section id="how" className="relative mx-auto max-w-7xl scroll-mt-24 overflow-hidden px-5 py-24 md:px-8">
        <Parallax className="pointer-events-none absolute right-0 top-10 h-80 w-80 rounded-full bg-signal/10 blur-3xl" />
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="section-title mt-4 max-w-[18ch]">This is for a change in your life, not a sales pitch.</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Payment trouble, a lease that is ending, a car that no longer fits — you get the choices that belong to your agreement.
          </p>
        </Reveal>
        <Stagger className="relative mt-12 grid gap-5 md:grid-cols-2">
          {steps.map((s) => (
            <StaggerItem key={s.n}>
              <div className="card h-full p-7">
                <div className="text-sm font-semibold text-signal">{s.n}</div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
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
              <button onClick={() => setOpen(true)} className="btn-primary relative mt-7">
                <Sparkles className="h-4 w-4" /> Ask Toyota NextMove AI
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-mist">
        <Reveal className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-20 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <h2 className="section-title">Look at your own agreement.</h2>
            <p className="mt-3 max-w-xl text-muted">
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
