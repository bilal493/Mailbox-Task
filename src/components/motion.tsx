"use client";

import {
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Honours the OS "reduce motion" setting for every framer-motion component below it. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

interface BaseProps {
  children: ReactNode;
  className?: string;
}

export function FadeIn({ children, className, delay = 0, y = 12 }: BaseProps & { delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Parent that reveals its <StaggerItem> children one after another. */
export function Stagger({
  children,
  className,
  as = "div",
  delay = 0.05,
  stagger = 0.07,
}: BaseProps & { as?: "div" | "ul" | "ol"; delay?: number; stagger?: number }) {
  const variants: Variants = { hidden: {}, show: { transition: { delayChildren: delay, staggerChildren: stagger } } };
  const props = { className, variants, initial: "hidden", animate: "show" } as const;
  if (as === "ul") return <motion.ul {...props}>{children}</motion.ul>;
  if (as === "ol") return <motion.ol {...props}>{children}</motion.ol>;
  return <motion.div {...props}>{children}</motion.div>;
}

export function StaggerItem({ children, className, as = "div" }: BaseProps & { as?: "div" | "li" }) {
  if (as === "li")
    return (
      <motion.li className={className} variants={itemVariants}>
        {children}
      </motion.li>
    );
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** Card that lifts slightly on hover. */
export function HoverLift({ children, className }: BaseProps) {
  return (
    <motion.div className={className} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      {children}
    </motion.div>
  );
}

/** Gentle floating loop for icons and illustrations. */
export function Float({ children, className }: BaseProps) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Number that counts up on mount and whenever the value changes. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const rounded = useTransform(mv, (v) => Math.round(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value, reduce]);

  return <motion.span className={className}>{rounded}</motion.span>;
}

export function ProgressBar({
  value,
  max,
  active = false,
  tone = "active",
  className,
}: {
  value: number;
  max: number;
  /** Pulses softly while work is still in progress. */
  active?: boolean;
  tone?: "active" | "success" | "destructive";
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const fill = tone === "success" ? "bg-primary" : tone === "destructive" ? "bg-destructive" : "bg-warning";
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <motion.div
        className={cn("h-full rounded-full", fill, active && "animate-pulse")}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
      />
    </div>
  );
}
