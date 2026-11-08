import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { heroPoster, type HeroClip } from "../media/heroClips";
import { cn } from "../lib/format";

const TUNDRA_CLIP = {
  label: "Toyota Tundra Off-Road Capability",
  src: "/media/tundra-bg.mp4",
  type: "video/mp4",
};

function useActiveOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ref]);
  return inView && visible;
}

/** Full-viewport hero. Background is the pulled Tundra off-road loop. */
export function VideoHero({ children }: { clips?: HeroClip[]; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(!reduce);
  const [videoOk, setVideoOk] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const onScreen = useActiveOnScreen(section);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const mediaY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);
  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);
  const active = playing && onScreen && !reduce && videoOk;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [active]);

  return (
    <section ref={section} data-dark-top className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-charcoal text-white">
      <motion.div style={{ y: mediaY, scale: mediaScale }} className={cn("absolute inset-0 -z-10", !active && "paused")}>
        <img
          src={heroPoster}
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className={cn("absolute inset-0 h-full w-full object-cover object-[72%_center] md:object-center", (!videoOk || reduce) && "kenburns")}
        />
        {!reduce && videoOk && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center brightness-112 brightness-112"
            autoPlay={active}
            muted
            playsInline
            loop
            preload="auto"
            poster={heroPoster}
            onError={() => setVideoOk(false)}
            aria-hidden
          >
            <source src={TUNDRA_CLIP.src} type={TUNDRA_CLIP.type} />
          </video>
        )}
      </motion.div>

      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal/50 via-charcoal/20 to-transparent" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal/40 via-charcoal/10 to-transparent" />
      <div aria-hidden className="grain absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay" />

      <div className="relative w-full">{children}</div>

      <div className="absolute bottom-6 right-5 z-10 flex items-center gap-3 md:right-8">
        <AnimatePresence mode="wait">
          <motion.span
            key={TUNDRA_CLIP.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="hidden text-xs text-white/60 sm:block"
          >
            {TUNDRA_CLIP.label}
          </motion.span>
        </AnimatePresence>
        {!reduce && videoOk && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={!playing}
            aria-label={playing ? "Pause background video" : "Play background video"}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md transition-colors duration-150 hover:bg-white/15"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
          </button>
        )}
      </div>
    </section>
  );
}








