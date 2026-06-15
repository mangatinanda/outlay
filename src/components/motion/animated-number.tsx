"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({
  value,
  format,
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();

  const source = useMotionValue(value);
  const spring = useSpring(source, { stiffness: 120, damping: 24, mass: 0.6 });
  const display = useTransform(spring, (latest) => format(latest));

  useEffect(() => {
    source.set(value);
  }, [source, value]);

  if (reduce) {
    return (
      <span className={cn("tabular-nums", className)}>{format(value)}</span>
    );
  }

  return (
    <motion.span className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  );
}
