const stops = [
  {
    title: "Customer calls",
    body: "By phone or from the browser. Retell handles speech-to-text and the voice back.",
    tech: "Retell AI",
  },
  {
    title: "Agent listens and confirms",
    body: "Nemotron pulls out what changed and reads back any dollar amount before using it.",
    tech: "NVIDIA Nemotron (NIM)",
  },
  {
    title: "Reads the real contract",
    body: "Typed tools fetch the loan or lease and the precomputed options. No free-form SQL, no made-up rates.",
    tech: "Django tools + SpacetimeDB",
  },
  {
    title: "Applies the rules",
    body: "Eligibility is deterministic. Vulnerable callers go to a person; no-consent callers get no offers.",
    tech: "Policy engine",
  },
  {
    title: "One clear next step",
    body: "Self-service, a specialist follow-up, or an eligible offer, and nothing changes until the customer says yes.",
    tech: "Live state in SpacetimeDB",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-night py-24 text-white">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <h2 className="max-w-3xl font-display text-[clamp(2.75rem,6vw,5rem)] leading-[0.9] tracking-wide">
          From “my hours got cut” to a next step in one call
        </h2>
        <p className="mt-4 max-w-[60ch] text-lg text-white/70">
          The language model talks. Tested code does the math and the eligibility. That split is what keeps answers honest.
        </p>
        <ol className="relative mt-14 grid gap-10 md:grid-cols-5 md:gap-6">
          <div aria-hidden className="absolute left-0 right-0 top-5 hidden h-[2px] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.3)_0_24px,transparent_24px_44px)] md:block" />
          {stops.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-signal bg-night font-display text-xl">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/70">{s.body}</p>
              <p className="mt-3 text-xs text-sodium">{s.tech}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
