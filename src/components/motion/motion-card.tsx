"use client";

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface MotionCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
}

export function MotionCard({ children, className, ...props }: MotionCardProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div
        className={cn(className)}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
