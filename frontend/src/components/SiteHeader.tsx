import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, LogOut, Menu, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/format";
import { useAssistant } from "../state/assistant";
import { useAuth } from "../state/auth";
import { ToyotaMark } from "./ToyotaMark";

export const NAV_ITEMS = [
  { to: "/vehicles", label: "Explore Vehicles" },
  { to: "/compare", label: "Compare Models" },
  { to: "/my-toyota", label: "My Toyota" },
  { to: "/insights", label: "Financial Insights" },
  { to: "/assistant", label: "AI Assistant" },
];

export function SiteHeader() {
  const { profile, signOut } = useAuth();
  const { setOpen: setAssistantOpen } = useAssistant();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [darkTop, setDarkTop] = useState(false);
  const overHero = darkTop && !scrolled && !open;

  useEffect(() => {
    const root = document.getElementById("content");
    if (!root) return;
    const check = () => {
      const first = root.querySelector("[data-dark-top]");
      setDarkTop(!!first && first.getBoundingClientRect().top + window.scrollY < 16);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter,color] duration-500 ease-[var(--ease-premium)]",
        overHero
          ? "bg-transparent text-white"
          : "border-b border-black/[0.06] bg-white/75 text-ink shadow-[0_8px_30px_-20px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150",
        open && "bg-white"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 md:h-[72px] md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Toyota Financial Services home">
          <span className="grid h-9 w-11 place-items-center">
            <ToyotaMark className="h-7 w-auto" />
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] font-semibold tracking-[0.24em]">TOYOTA</span>
            <span className={cn("block text-xs", overHero ? "text-white/70" : "text-muted")}>Financial Services</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "group relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150",
                  overHero ? "text-white/80 hover:text-white" : "text-ink/65 hover:text-ink",
                  isActive && (overHero ? "text-white" : "text-ink")
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {!isActive && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-3.5 -bottom-0.5 h-px origin-left scale-x-0 transition-transform duration-200 ease-[var(--ease-premium)] group-hover:scale-x-100",
                        overHero ? "bg-white/60" : "bg-ink/40"
                      )}
                    />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3.5 -bottom-0.5 h-[2px] rounded-full bg-signal"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {profile ? (
            <div className="hidden items-center gap-1 sm:flex">
              <Link
                to="/my-toyota"
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  overHero ? "hover:bg-white/10" : "hover:bg-black/[0.04]"
                )}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-signal text-xs font-semibold text-white">
                  {profile.customer.first_name[0]}
                </span>
                <span className="leading-tight">
                  <span className="block">{profile.customer.first_name}</span>
                  <span className={cn("block text-[10px] font-normal", overHero ? "text-white/60" : "text-muted")}>
                    Your account
                  </span>
                </span>
              </Link>
              <button
                onClick={() => {
                  signOut();
                  navigate("/");
                }}
                aria-label="Sign out"
                className={cn("grid h-9 w-9 place-items-center rounded-full transition-colors", overHero ? "hover:bg-white/10" : "hover:bg-black/[0.04]")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/signin"
              className={cn(
                "hidden items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors sm:flex",
                overHero ? "hover:bg-white/10" : "hover:bg-black/[0.04]"
              )}
            >
              <UserRound className="h-4 w-4" /> Sign in
            </Link>
          )}
          <button
            onClick={() => (profile ? setAssistantOpen(true) : navigate("/signin?next=/assistant"))}
            className="btn-primary hidden px-4 py-2.5 md:inline-flex"
          >
            <Check className="h-4 w-4" /> Ask AI
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className={cn("grid h-10 w-10 place-items-center rounded-full lg:hidden", overHero ? "hover:bg-white/10" : "hover:bg-black/[0.04]")}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "calc(100svh - 64px)" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-y-auto border-t border-black/[0.06] bg-white/95 text-ink backdrop-blur-xl lg:hidden"
          >
            <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col px-5 py-6">
              {NAV_ITEMS.map((item, i) => (
                <motion.div key={item.to} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn("flex items-center justify-between border-b border-line py-4 text-xl font-semibold tracking-tight", isActive && "text-signal")
                    }
                  >
                    {item.label} <ArrowRight className="h-5 w-5 opacity-40" />
                  </NavLink>
                </motion.div>
              ))}
              <div className="mt-6 grid gap-3">
                <button
                  onClick={() => {
                    setOpen(false);
                    if (profile) setAssistantOpen(true);
                    else navigate("/signin?next=/assistant");
                  }}
                  className="btn-primary"
                >
                  Ask Toyota Vroom AI
                </button>
                <Link to={profile ? "/financial-services" : "/signin?next=/financial-services"} className="btn-ghost border-line">
                  Financial services
                </Link>
                {profile ? (
                  <button
                    onClick={() => {
                      signOut();
                      navigate("/");
                    }}
                    className="btn-ghost border-line"
                  >
                    Sign out {profile.customer.first_name}
                  </button>
                ) : (
                  <Link to="/signin" className="btn-ghost border-line">
                    Sign in
                  </Link>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-charcoal text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-4 md:px-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-11 place-items-center">
              <ToyotaMark className="h-7 w-auto" />
            </span>
            <span className="text-sm font-semibold tracking-[0.22em]">TOYOTA</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            A HackUTD concept for Toyota Financial Services customers. Your contract stays put until you authorize a next step.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Explore</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            {[...NAV_ITEMS, { to: "/financial-services", label: "Financial services" }].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="transition-colors duration-150 hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">This prototype</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li>Synthetic customers only</li>
            <li>Not an official Toyota site</li>
            <li>No credit report is pulled</li>
            <li>Vehicle data: U.S. government safety, recall, and fuel economy records. Photos: Wikimedia Commons</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-xs text-white/45 md:px-8">
        <div className="mx-auto max-w-7xl">© 2026 HackUTD concept. Account figures are fictional.</div>
      </div>
    </footer>
  );
}
