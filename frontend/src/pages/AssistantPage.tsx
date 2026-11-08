import { BarChart3, Car, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AssistantChat } from "../components/assistant/AssistantChat";
import { Reveal } from "../components/ui/motion";
import { money } from "../lib/format";
import { isNewAccount } from "../lib/sessionProfile";
import { CATEGORY_IMAGE, modelImage, modelImageNote } from "../media/vehicleImages";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

const CAN = [
  { icon: LineChart, title: "Explain your financing", body: "Payment breakdowns, extra-payment and term scenarios, lease-end choices." },
  { icon: Car, title: "Look up and compare Toyotas", body: "Specs, efficiency, and fuel-cost estimates from the vehicle catalog." },
  { icon: BarChart3, title: "Show its work", body: "Every answer lists the backend tools it checked, with the raw figures." },
  { icon: ShieldCheck, title: "Stay inside the rules", body: "No invented rates or approvals. Account requests need your confirmation." },
];

export function AssistantPage() {
  usePageContext("assistant");
  const { profile: p } = useAuth();
  const backdrop = p ? modelImage(p.vehicle.model) : CATEGORY_IMAGE.suvs;

  return (
    <main className="pb-20">
      <section data-dark-top className="relative isolate overflow-hidden bg-charcoal pb-40 pt-16 text-white md:pt-[72px]">
        <img src={backdrop} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35 blur-[2px]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-charcoal/70 via-charcoal/85 to-charcoal" />
        <div className="mx-auto max-w-7xl px-5 pt-12 md:px-8 md:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-sodium" /> Powered by NVIDIA Nemotron
          </p>
          <h1 className="mt-5 text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.03em]">Toyota NextMove AI</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70">
            Ask in your own words. Answers come from your simulated account and the vehicle catalog, with backend tools behind every figure.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-28 grid max-w-7xl gap-6 px-5 md:px-8 lg:grid-cols-[1fr_21rem]">
        <Reveal className="card flex h-[min(48rem,calc(100svh-8rem))] flex-col overflow-hidden shadow-2xl shadow-black/20">
          <AssistantChat />
        </Reveal>
        <Reveal delay={0.08} className="space-y-4">
          {p ? (
            <div className="card overflow-hidden p-0">
              <div className="relative aspect-[16/9]">
                <img src={modelImage(p.vehicle.model)} alt="" aria-hidden title={modelImageNote(p.vehicle.model)} className="h-full w-full object-cover" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute inset-x-4 bottom-3 text-white">
                  <p className="text-[11px] uppercase tracking-wider text-white/70">The AI is reading</p>
                  <p className="font-semibold">
                    {p.vehicle.model ? `${p.vehicle.model_year} Toyota ${p.vehicle.model} ${p.vehicle.trim}` : "Your Toyota"}
                  </p>
                </div>
                <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">Representative image</span>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-line">
                <div className="bg-paper p-4">
                  <dt className="text-xs text-muted">{p.account.contract_type === "lease" ? "Lease" : "Loan"} payment</dt>
                  <dd className="mt-0.5 font-semibold">{money(p.account.monthly_payment, true)}/mo</dd>
                </div>
                <div className="bg-paper p-4">
                  <dt className="text-xs text-muted">Account</dt>
                  <dd className="mt-0.5 font-semibold">{p.customer.first_name} · {isNewAccount(p) ? "Self-reported" : "Simulated"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="font-semibold">Answers get specific when you sign in.</h2>
              <p className="mt-1 text-sm text-muted">Pick a demo customer and the assistant reads their simulated loan or lease.</p>
              <Link to="/signin?next=/assistant" className="btn-primary mt-4 inline-flex">Choose a demo account</Link>
            </div>
          )}
          <div className="card divide-y divide-line p-0">
            {CAN.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3 p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal/10">
                  <Icon className="h-4.5 w-4.5 text-signal" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </main>
  );
}
