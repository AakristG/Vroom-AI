import { Link } from "react-router-dom";
import { AssistantChat } from "../components/assistant/AssistantChat";
import { Reveal } from "../components/ui/motion";
import { money } from "../lib/format";
import { isNewAccount } from "../lib/sessionProfile";
import { modelImage, modelImageNote } from "../media/vehicleImages";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";


export function AssistantPage() {
  usePageContext("assistant");
  const { profile: p } = useAuth();

  return (
    <main className="pb-20">
      <section data-dark-top className="relative isolate overflow-hidden bg-charcoal pb-40 pt-16 text-white md:pt-[72px]">
        <img src="/media/assistant/vroom-ai-bg.png" alt="" aria-hidden decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_55%] opacity-60 blur-[1px]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-charcoal/40 via-charcoal/70 to-charcoal" />
        <div className="mx-auto max-w-7xl px-5 pt-12 md:px-8 md:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            Powered by NVIDIA Nemotron
          </p>
          <h1 className="mt-5 text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.03em]">Toyota Vroom AI</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70">
            Ask in your own words. Answers come from your account and the vehicle catalog, with backend tools behind every figure.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-28 grid max-w-7xl gap-6 px-5 md:px-8 lg:grid-cols-[1fr_28rem]">
        <Reveal className="card flex h-[min(48rem,calc(100svh-8rem))] flex-col overflow-hidden shadow-2xl shadow-black/20">
          <AssistantChat />
        </Reveal>
        <Reveal delay={0.08} className="space-y-4">
          {p ? (
            <div className="card overflow-hidden p-0">
              <div className="relative aspect-[4/3]">
                <img src={modelImage(p.vehicle.model)} alt="" aria-hidden loading="lazy" decoding="async" title={modelImageNote(p.vehicle.model)} className="h-full w-full object-cover" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute inset-x-5 bottom-4 text-white">
                  <p className="text-xl font-semibold tracking-tight">
                    {p.vehicle.model ? `${p.vehicle.model_year} Toyota ${p.vehicle.model} ${p.vehicle.trim}` : "Your Toyota"}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-line">
                <div className="bg-paper p-5">
                  <dt className="text-xs text-muted">{p.account.contract_type === "lease" ? "Lease" : "Loan"} payment</dt>
                  <dd className="mt-0.5 text-lg font-semibold">{money(p.account.monthly_payment, true)}/mo</dd>
                </div>
                <div className="bg-paper p-5">
                  <dt className="text-xs text-muted">Account</dt>
                  <dd className="mt-0.5 text-lg font-semibold">{p.customer.first_name} · {isNewAccount(p) ? "Self-reported" : "On file"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="font-semibold">Answers get specific when you sign in.</h2>
              <p className="mt-1 text-sm text-muted">Sign in and the assistant reads your loan or lease.</p>
              <Link to="/signin?next=/assistant" className="btn-primary mt-4 inline-flex">Sign in</Link>
            </div>
          )}
        </Reveal>
      </div>
    </main>
  );
}
