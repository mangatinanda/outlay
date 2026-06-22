"use client";

import {
  HandCoins,
  LayoutDashboard,
  PlusCircle,
  Receipt,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive } from "./mobile-nav-active";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/expenses/new", label: "Add", icon: PlusCircle },
  { href: "/settle-up", label: "Settle up", icon: HandCoins },
  { href: "/members", label: "Members", icon: Users },
];

export function MobileNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // The /expenses list mounts an AddExpenseSheet whose FAB owns the shared
  // `add-fab` layoutId for the FAB->sheet morph. Exactly one element may own
  // that id at a time, so the nav FAB relinquishes it on that route (the link
  // still works; it just doesn't claim the shared element there).
  const navFabOwnsLayout = pathname !== "/expenses";

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-stretch justify-around px-2">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
          const isAdd = item.href === "/expenses/new";

          if (isAdd) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className="relative -top-3 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 text-muted-foreground text-xs"
              >
                <motion.span
                  layoutId={
                    navFabOwnsLayout && !reduceMotion ? "add-fab" : undefined
                  }
                  whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float"
                >
                  <item.icon className="h-6 w-6" />
                </motion.span>
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 font-medium text-xs transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 500, damping: 35 }
                  }
                  className="absolute inset-x-1 top-1 bottom-1 -z-10 rounded-xl bg-primary/5"
                />
              )}
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
