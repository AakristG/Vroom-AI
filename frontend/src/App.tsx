import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AssistantDock } from "./components/assistant/AssistantDock";
import { LandingPage } from "./components/LandingPage";
import { SiteFooter, SiteHeader } from "./components/SiteHeader";

const ExplorePage = lazy(() => import("./pages/ExplorePage").then((m) => ({ default: m.ExplorePage })));
const VehicleDetailPage = lazy(() => import("./pages/VehicleDetailPage").then((m) => ({ default: m.VehicleDetailPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const MyToyotaPage = lazy(() => import("./pages/MyToyotaPage").then((m) => ({ default: m.MyToyotaPage })));
const InsightsPage = lazy(() => import("./pages/InsightsPage").then((m) => ({ default: m.InsightsPage })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })));
const SignInRoute = lazy(() => import("./pages/SignInRoute").then((m) => ({ default: m.SignInRoute })));

function RouteFallback() {
  return (
    <div data-dark-top className="min-h-[70vh] bg-charcoal pt-32" aria-busy="true">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-5 h-12 w-2/3 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 350);
      return () => window.clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Page({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </motion.div>
  );
}

function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-daylight text-ink">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader />
      <ScrollManager />
      <div id="content">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Page><LandingPage /></Page>} />
            <Route path="/vehicles" element={<Page><ExplorePage /></Page>} />
            <Route path="/vehicles/:year/:model/:trim?" element={<Page><VehicleDetailPage /></Page>} />
            <Route path="/compare" element={<Page><ComparePage /></Page>} />
            <Route path="/my-toyota" element={<Page><MyToyotaPage /></Page>} />
            <Route path="/insights" element={<Page><InsightsPage /></Page>} />
            <Route path="/assistant" element={<Page><AssistantPage /></Page>} />
            <Route path="/signin" element={<Page><SignInRoute /></Page>} />
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
        </AnimatePresence>
      </div>
      <SiteFooter />
      <AssistantDock />
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-40 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="section-title mt-4">That page took a wrong turn.</h1>
      <Link to="/" className="btn-primary mt-8">
        Back to home
      </Link>
    </main>
  );
}

export default App;
