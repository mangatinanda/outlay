"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
};

export interface StaggerProps {
  children: React.ReactNode;
  className?: string;
}

export function Stagger({ children, className }: StaggerProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div className={cn(className)} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
