import { ArrowRight, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { profiles } from "../data/types";
import { journeyFor } from "../lib/journey";
import { PageIntro } from "./ui/kit";
import { Stagger, StaggerItem } from "./ui/motion";

export function SignInGate({ next, title }: { next: string; title: string }) {
  return (
    <main className="pb-24">
      <PageIntro eyebrow="Sign in required" title={title}>
        Your account details stay private until you sign in. This demo uses fictional Toyota Financial Services customers.
      </PageIntro>
      <div className="mx-auto max-w-7xl px-5 pt-10 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Lock className="h-4 w-4" /> Pick a demo customer, or sign in with a first name as both username and password.
          </p>
          <Link to={`/signin?next=${encodeURIComponent(next)}`} className="btn-primary">
            Sign in <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {profiles.map((p) => {
            const j = journeyFor(p);
            return (
              <StaggerItem key={p.customer.customer_id}>
                <Link
                  to={`/signin?as=${p.customer.first_name}&next=${encodeURIComponent(next)}`}
                  className="card group flex h-full flex-col p-5 transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-signal">{j.eyebrow}</span>
                  <span className="mt-2 font-semibold">
                    {p.customer.first_name} · {p.moment}
                  </span>
                  <span className="mt-1 text-sm text-muted">
                    {p.vehicle.model_year} {p.vehicle.model} · {p.account.contract_type}
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </main>
  );
}
