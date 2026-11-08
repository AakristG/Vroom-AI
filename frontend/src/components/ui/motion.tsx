import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "section" | "li" | "header";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: reduce ? 0.2 : 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE } },
  };
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/** Counts up to `value` once it scrolls into view. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US") }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const fmt = useRef(format);
  fmt.current = format;
  const [text, setText] = useState(() => format(reduce ? value : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setText(fmt.current(value));
      return;
    }
    const controls = animate(mv, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (n) => setText(fmt.current(n)),
      onComplete: () => setText(fmt.current(value)),
    });
    return () => {
      controls.stop();
      setText(fmt.current(value));
    };
  }, [inView, reduce, value, mv]);

  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden>{text}</span>
      <span className="sr-only">{fmt.current(value)}</span>
    </span>
  );
}

/** Decorative layer that drifts against the scroll. */
export function Parallax({ children, className, distance = 80 }: { children?: ReactNode; className?: string; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [distance, -distance]);
  return (
    <motion.div ref={ref} aria-hidden style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
