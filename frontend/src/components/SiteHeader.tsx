import { ToyotaMark } from "./ToyotaMark";

export function SiteHeader({
  signedInName,
  onHome,
  onSignIn,
  onAccount,
  onSignOut,
}: {
  signedInName: string | null;
  onHome: (section?: string) => void;
  onSignIn: () => void;
  onAccount: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <button onClick={() => onHome()} className="flex items-center gap-2 text-ink">
          <ToyotaMark className="h-7 w-11" />
          <span className="text-left leading-tight">
            <span className="block text-[11px] font-semibold tracking-[0.22em]">TOYOTA</span>
            <span className="block text-xs text-muted">Financial Services</span>
          </span>
        </button>
        <nav className="hidden items-center gap-6 text-sm text-ink/80 md:flex">
          <button onClick={() => onHome("how")} className="hover:text-ink">
            How it helps
          </button>
          <button onClick={() => onHome("numbers")} className="hover:text-ink">
            Your numbers
          </button>
          <button onClick={() => onHome("promise")} className="hover:text-ink">
            What we won't do
          </button>
          {signedInName && (
            <button onClick={onAccount} className="hover:text-ink">
              Your account
            </button>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {signedInName ? (
            <>
              <button onClick={onAccount} className="hidden text-sm font-medium sm:inline">
                {signedInName}
              </button>
              <button onClick={onSignOut} className="whitespace-nowrap rounded-full px-3 py-2 text-sm hover:bg-daylight">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={onSignIn} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium hover:bg-daylight">
              Sign in
            </button>
          )}
          <button
            onClick={signedInName ? onAccount : onSignIn}
            className="whitespace-nowrap rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-deep"
          >
            {signedInName ? "Account" : "Your options"}
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-4 md:px-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <ToyotaMark className="h-6 w-9" />
            <span className="text-sm font-semibold tracking-[0.18em]">TOYOTA</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            A HackUTD concept for Toyota Financial Services customers. Your contract stays put until you authorize a next step.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">For you</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Your loan or lease</li>
            <li>Payment help</li>
            <li>Lease-end choices</li>
            <li>Talk with a person</li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">This prototype</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Synthetic customers only</li>
            <li>Not an official Toyota site</li>
            <li>No credit report is pulled</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line px-5 py-4 text-xs text-muted md:px-8">
        <div className="mx-auto max-w-6xl">© 2026 HackUTD concept. Account figures are fictional.</div>
      </div>
    </footer>
  );
}
