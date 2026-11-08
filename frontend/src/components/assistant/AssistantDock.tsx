import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAssistant } from "../../state/assistant";

const AssistantChat = lazy(() => import("./AssistantChat").then((m) => ({ default: m.AssistantChat })));

const DEFAULT_HINT = "Ask NextMove AI";
const HINTS: Record<string, string> = {
  explore: "Need help choosing a model?",
  "vehicle-detail": "Questions about this Toyota?",
  compare: "Need help comparing these?",
  insights: "Want to understand your options?",
  "my-toyota": "Questions about your account?",
  "financial-services": "Questions about your account?",
};

export function AssistantDock() {
  const { open, setOpen, context } = useAssistant();
  const { pathname } = useLocation();
  const onAssistantPage = pathname === "/assistant";
  const hint = HINTS[context.page] ?? DEFAULT_HINT;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (onAssistantPage) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Toyota NextMove AI"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[55] flex h-[min(42rem,calc(100svh-6rem))] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-paper shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] sm:inset-x-auto sm:right-5 sm:w-[26rem]"
          >
            <div className="flex items-center justify-between bg-charcoal px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-signal">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">Toyota NextMove AI</div>
                  <div className="text-[11px] text-white/60">Powered by NVIDIA Nemotron</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link to="/assistant" onClick={() => setOpen(false)} aria-label="Open full screen" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
                  <Maximize2 className="h-4 w-4" />
                </Link>
                <button onClick={() => setOpen(false)} aria-label="Close assistant" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Suspense fallback={<div className="flex-1 animate-pulse bg-mist/40" aria-busy="true" />}>
              <AssistantChat compact />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpen(true)}
            aria-label={`Open Toyota NextMove AI. ${hint}`}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[55] flex items-center gap-2.5 rounded-full bg-charcoal py-2.5 pl-2.5 pr-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10 sm:pr-5 md:bottom-6 md:right-6"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-signal">
              <Sparkles className="h-4 w-4" />
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={hint}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="hidden text-left leading-tight sm:block"
              >
                <span className="block">{hint}</span>
                <span className="block text-[10px] font-normal text-white/55">{hint === DEFAULT_HINT ? "Powered by NVIDIA Nemotron" : "Toyota NextMove AI"}</span>
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
