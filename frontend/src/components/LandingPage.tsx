import { Check, MessageCircle, Phone, Shield } from "lucide-react";

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

export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main>
      <section className="relative overflow-hidden bg-[#f7f7f7]">
        <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-signal/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-10 h-96 w-96 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-sm font-medium tracking-wide text-signal">Toyota Financial Services</p>
            <h1 className="mt-3 max-w-[14ch] text-5xl font-semibold tracking-tight text-ink md:text-6xl">
              What's the smartest next move for you and your Toyota?
            </h1>
            <p className="mt-5 max-w-[42rem] text-lg leading-relaxed text-muted">
              Tell us what is going on. We look at your financing agreement, explain the options that actually apply, and let you choose. We will not talk you into a car, and we will not change your contract for you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onSignIn} className="rounded-full bg-signal px-6 py-3 font-medium text-white hover:bg-signal-deep">
                Sign in to your account
              </button>
              <a href="#how" className="rounded-full border border-ink/15 bg-paper px-6 py-3 font-medium hover:bg-white">
                See how it works
              </a>
            </div>
          </div>

          <aside className="rounded-3xl border border-line bg-paper p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Example · synthetic account</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">A payment that got harder to make</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Hours were cut. The Camry payment is still $602. Here is what we would put on the table — and what we would not promise.
            </p>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Keep the loan" value="$602/mo" note="No change" />
              <Row label="Extend 12 months" value="$474/mo" note="Lower now, about $820 more interest later" />
              <Row label="Skip one payment" value="Needs a person" note="About $125 interest may be added. Not a guarantee." />
            </dl>
            <p className="mt-5 text-xs text-muted">Refinance is not offered here because of a recent missed payment. Sign in to see the numbers on your own agreement.</p>
          </aside>
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-px border-t border-line bg-line px-0 sm:grid-cols-3">
          {[
            ["Your contract", "Loan, lease, or neither — we say which one you actually have."],
            ["Plain costs", "Payment, upfront amount, and what it adds up to."],
            ["Your say-so", "We explain. You authorize. Or you don't."],
          ].map(([title, body]) => (
            <div key={title} className="bg-[#f7f7f7] px-5 py-6 md:px-8">
              <div className="font-semibold">{title}</div>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:px-8">
        <h2 className="max-w-[16ch] text-4xl font-semibold tracking-tight">Help with the Toyota you already drive.</h2>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          This is for a change in your life, not a sales pitch. Payment trouble, a lease that is ending, a car that no longer fits — you get the choices that belong to your agreement.
        </p>
        <ol className="mt-12 grid gap-6 md:grid-cols-2">
          {steps.map((s) => (
            <li key={s.n} className="rounded-3xl border border-line bg-paper p-6">
              <div className="text-sm font-semibold text-signal">{s.n}</div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="numbers" className="bg-paper py-20">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 md:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">We start from your account. We do not guess the rest.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Toyota Financial Services already has your vehicle and your contract. It does not automatically know that your pay changed, what your rent is, or what you owe on other cards. You can tell us those things. You do not have to connect another bank.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard
              title="Already on your account"
              items={["Who you are", "Your Toyota", "Monthly payment", "Balance or residual", "Due date and maturity", "Loan or lease"]}
            />
            <InfoCard
              title="Only if you tell us"
              items={["Pay went up or down", "A new child", "A move", "Rent and other bills", "What you want to do next"]}
            />
          </div>
        </div>
      </section>

      <section id="promise" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">What we will not do.</h2>
            <ul className="mt-6 space-y-4">
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
          </div>
          <div className="rounded-3xl bg-ink p-8 text-white">
            <MessageCircle className="h-6 w-6 text-signal" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Talk it through, by phone or here.</h3>
            <p className="mt-3 leading-relaxed text-white/75">
              Say what changed in your own words. If a dollar amount matters, we read it back before we use it — a misheard $500 and $5,000 should not change your options.
            </p>
            <div className="mt-6 flex items-center gap-3 text-sm text-white/80">
              <Phone className="h-4 w-4" />
              You can call, or sign in and review everything on the page first.
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">Look at your own agreement.</h2>
            <p className="mt-3 max-w-xl text-muted">
              Demo sign-in uses fictional Toyota Financial Services customers. After you sign in, you only see that one account.
            </p>
          </div>
          <button onClick={onSignIn} className="rounded-full bg-signal px-6 py-3 font-medium text-white hover:bg-signal-deep">
            Sign in
          </button>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid grid-cols-[minmax(9rem,1fr)_auto] items-start gap-4 border-b border-line pb-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        <div className="font-semibold">{value}</div>
        <div className="text-xs text-muted">{note}</div>
      </dd>
    </div>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-line bg-[#f7f7f7] p-5">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
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
