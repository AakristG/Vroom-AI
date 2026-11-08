import { BarChart3, Car, LineChart, ShieldCheck } from "lucide-react";
import { AssistantChat } from "../components/assistant/AssistantChat";
import { PageIntro } from "../components/ui/kit";
import { Reveal } from "../components/ui/motion";
import { usePageContext } from "../state/assistant";

const CAN = [
  { icon: LineChart, title: "Explain your financing", body: "Payment breakdowns, extra-payment and term scenarios, lease-end choices." },
  { icon: Car, title: "Look up and compare Toyotas", body: "Specs, efficiency, and fuel-cost estimates from the vehicle catalog." },
  { icon: BarChart3, title: "Show its work", body: "Every answer lists the backend tools it checked, with the raw figures." },
  { icon: ShieldCheck, title: "Stay inside the rules", body: "No invented rates or approvals. Account requests need your confirmation." },
];

export function AssistantPage() {
  usePageContext("assistant");
  return (
    <main className="pb-20">
      <PageIntro eyebrow="AI Assistant" title="Toyota NextMove AI">
        Ask in your own words. NVIDIA Nemotron answers from your simulated account and the vehicle catalog, using backend tools for every figure.
      </PageIntro>
      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 md:px-8 lg:grid-cols-[1fr_20rem]">
        <Reveal className="card flex h-[min(46rem,calc(100svh-10rem))] flex-col overflow-hidden">
          <AssistantChat />
        </Reveal>
        <Reveal delay={0.08} className="space-y-4">
          {CAN.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <Icon className="h-5 w-5 text-signal" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </main>
  );
}
