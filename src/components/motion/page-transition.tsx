"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
