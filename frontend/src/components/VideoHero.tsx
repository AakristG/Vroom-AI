import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/format";

export function VideoHero({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(!reduce);
  const videoRef = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const mediaY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);
  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);

  // Direct configuration pointing to your processed Tundra off-road background loop
  const clip = {
    label: "Toyota Tundra Off-Road Capability",
    src: "/media/tundra-bg.mp4",
    type: "video/mp4",
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing, clip.src]);

  return (
    <section ref={section} data-dark-top className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-charcoal text-white">
      <motion.div style={{ y: mediaY, scale: mediaScale }} className={cn("absolute inset-0 -z-10", !playing && "paused")}>
        <AnimatePresence initial={false}>
          <motion.video
            key={clip.src}
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover opacity-50"
            autoPlay={playing}
            muted
            playsInline
            preload="auto"
            loop
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
            aria-hidden
          >
            <source src={clip.src} type={clip.type} />
          </motion.video>
        </AnimatePresence>
      </motion.div>

      {/* Readability: Darkened gradients & vignette overlays so header text and buttons remain crisp */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal/95 via-charcoal/45 to-charcoal/50" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal/80 via-charcoal/20 to-transparent" />
      <div aria-hidden className="grain absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay" />

      <div className="relative w-full">{children}</div>

      <div className="absolute bottom-6 right-5 z-10 flex items-center gap-3 md:right-8">
        <AnimatePresence mode="wait">
          <motion.span
            key={clip.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="hidden text-xs text-white/60 sm:block"
          >
            {clip.label}
          </motion.span>
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={!playing}
          aria-label={playing ? "Pause background motion" : "Play background motion"}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md transition-colors hover:bg-white/15"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
      </div>
    </section>
  );
}