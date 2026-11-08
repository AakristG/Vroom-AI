import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import { heroPoster, type HeroClip } from "../media/heroClips";
import { cn } from "../lib/format";

interface PlayableClip {
  label: string;
  src: string;
  type: string;
}

/** Seconds of overlap between the end of one pass and the start of the next. */
const CROSSFADE = 1.2;

async function isVideo(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("video/");
  } catch {
    return false;
  }
}

/** Resolve the clips that actually exist, preferring WebM when the browser can play it. */
function usePlayableClips(clips: HeroClip[], enabled: boolean) {
  const [playable, setPlayable] = useState<PlayableClip[] | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPlayable([]);
      return;
    }
    let cancelled = false;
    const probe = document.createElement("video");
    const webmOk = probe.canPlayType('video/webm; codecs="vp9"') !== "";
    Promise.all(
      clips.map(async (clip) => {
        const candidates = [
          webmOk && clip.webm ? { src: clip.webm, type: "video/webm" } : null,
          clip.mp4 ? { src: clip.mp4, type: "video/mp4" } : null,
        ].filter(Boolean) as { src: string; type: string }[];
        for (const c of candidates) if (await isVideo(c.src)) return { label: clip.label, ...c };
        return null;
      })
    ).then((found) => {
      if (!cancelled) setPlayable(found.filter(Boolean) as PlayableClip[]);
    });
    return () => {
      cancelled = true;
    };
  }, [clips, enabled]);
  return playable;
}

function useImageAvailable(src: string) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setOk(true);
    img.onerror = () => setOk(false);
    img.src = src;
  }, [src]);
  return ok;
}

/** True while the element is on screen and the tab is visible. */
function useActiveOnScreen(ref: RefObject<HTMLElement | null>) {
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

function saveData() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

export function VideoHero({ clips, children }: { clips: HeroClip[]; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [lightweight] = useState(saveData);
  const playable = usePlayableClips(clips, !reduce && !lightweight);
  const posterOk = useImageAvailable(heroPoster);
  const [pass, setPass] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const section = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const advancedAt = useRef(-1);
  const onScreen = useActiveOnScreen(section);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  const mediaY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "8%"]);

  const hasVideo = Boolean(playable && playable.length > 0);
  const clip = hasVideo ? playable![pass % playable!.length] : null;
  const active = playing && onScreen;

  useEffect(() => {
    media.current?.querySelectorAll("video").forEach((v) => {
      if (active) v.play().catch(() => setPlaying(false));
      else v.pause();
    });
  }, [active, pass, clip?.src]);

  // Start the next pass slightly before this one ends and crossfade, so a loop never shows a black frame.
  function onTimeUpdate(e: SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (!v.duration || advancedAt.current === pass) return;
    if (v.duration - v.currentTime <= CROSSFADE) {
      advancedAt.current = pass;
      setPass((n) => n + 1);
    }
  }

  return (
    <section ref={section} data-dark-top className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-charcoal text-white">
      <motion.div ref={media} style={{ y: mediaY }} className={cn("absolute inset-0 -z-10 scale-[1.04]", !active && "paused")}>
        {posterOk ? (
          <img
            src={heroPoster}
            alt=""
            aria-hidden
            fetchPriority="high"
            decoding="async"
            className={cn("absolute inset-0 h-full w-full object-cover object-[72%_center] md:object-center", !hasVideo && !reduce && "kenburns")}
          />
        ) : (
          posterOk === false && !hasVideo && <DuskRoad animated={!reduce} />
        )}
        {hasVideo && clip && (
          <AnimatePresence initial={false}>
            <motion.video
              key={`${clip.src}#${pass}`}
              className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center"
              autoPlay={active}
              muted
              playsInline
              preload="auto"
              poster={posterOk ? heroPoster : undefined}
              onTimeUpdate={onTimeUpdate}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CROSSFADE, ease: "easeInOut" }}
              aria-hidden
            >
              <source src={clip.src} type={clip.type} />
            </motion.video>
          </AnimatePresence>
        )}
      </motion.div>

      {/* Readability: darker at the bottom-left where the copy sits, clear on the right where the truck drives in. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal via-charcoal/30 to-charcoal/40" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal/85 via-charcoal/30 to-transparent" />
      <div aria-hidden className="grain absolute inset-0 -z-10 opacity-[0.06] mix-blend-overlay" />

      <div className="relative w-full">{children}</div>

      <div className="absolute bottom-6 right-5 z-10 flex items-center gap-3 md:right-8">
        {clip && <span className="hidden text-xs text-white/60 sm:block">{clip.label}</span>}
        {!reduce && (hasVideo || posterOk !== null) && (
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

/** Built-in scene used when neither the video nor its poster has been added: dusk sky, hills, and a road. */
function DuskRoad({ animated }: { animated: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className={cn("absolute inset-0", animated && "drift")}>
        <div className="absolute inset-0 bg-[radial-gradient(110%_75%_at_70%_62%,#8a3a32_0%,#4a2430_26%,#221a24_52%,#121317_80%)]" />
        <div className="absolute left-[70%] top-[44%] h-[52vmin] w-[52vmin] -translate-x-1/2 rounded-full bg-[#ff6a4a] opacity-45 blur-[100px]" />
        <div className="absolute left-[70%] top-[54%] h-[10vmin] w-[10vmin] -translate-x-1/2 rounded-full bg-[#ffd9b0] opacity-90 blur-[1px] shadow-[0_0_80px_30px_rgba(255,170,120,0.35)]" />
        <svg viewBox="0 0 1440 400" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[30%] h-[28%] w-full">
          <path fill="#1e1a22" d="M0 400V250C160 180 300 150 460 190s300 90 470 40 330-140 510-90V400z" />
          <path fill="#17161b" d="M0 400V300c200-60 380-80 560-40s340 70 520 20 260-60 360-40V400z" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[#0f1013] [perspective:600px]">
        <div className="absolute inset-0 origin-top [transform:rotateX(62deg)]">
          <div className="absolute left-1/2 top-0 h-[260%] w-[3px] -translate-x-1/2 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,.55)_0_40px,transparent_40px_100px)] opacity-70" />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-white/15" />
        <div className={cn("absolute top-[22%] h-[3px] w-1/2 rounded-full bg-gradient-to-r from-transparent via-signal to-transparent blur-[1px]", animated ? "trail-loop" : "opacity-60")} />
        <div className={cn("absolute top-[48%] h-[2px] w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#ffd2a6] to-transparent blur-[1px]", animated ? "trail-loop-late" : "hidden")} />
      </div>
    </div>
  );
}
