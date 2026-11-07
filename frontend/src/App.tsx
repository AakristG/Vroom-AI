import { useEffect, useState } from "react";
import { checkBackendHealth } from "./api/client";
import { AccountSummary } from "./components/AccountSummary";
import { CallPanel } from "./components/CallPanel";
import { CustomerRail } from "./components/CustomerRail";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Nav } from "./components/Nav";
import { NextMove } from "./components/NextMove";
import { OptionsCompare } from "./components/OptionsCompare";
import { ValueStrip } from "./components/ValueStrip";
import { profiles } from "./data/types";

function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [selected, setSelected] = useState("C002");

  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  const p = profiles.find((x) => x.customer.customer_id === selected) ?? profiles[0];

  const takeCall = (id: string) => {
    setSelected(id);
    document.getElementById("console")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Nav backendOk={backendOk} />
      <main>
        <Hero onTakeCall={takeCall} />

        <section id="console" className="mx-auto max-w-[96rem] scroll-mt-4 px-4 py-10 md:px-6">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
            <CustomerRail profiles={profiles} selected={selected} onSelect={setSelected} />
            <div className="min-w-0 space-y-5" key={p.customer.customer_id}>
              <AccountSummary p={p} />
              <NextMove p={p} />
              <OptionsCompare p={p} />
            </div>
            <CallPanel p={p} />
          </div>
        </section>

        <HowItWorks />
        <ValueStrip />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted md:px-8">
          <span className="font-display text-2xl tracking-wide text-ink">
            Next<span className="text-signal">/</span>Move
          </span>
          <span>HackUTD 2026 · Toyota Financial Services challenge · All customers, rates, and offers are synthetic.</span>
        </div>
      </footer>
    </>
  );
}

export default App;
