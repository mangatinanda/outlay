"use client";

import {
  Building2,
  Home,
  LayoutDashboard,
  Receipt,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HouseholdSwitcher } from "./household-switcher";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/members", label: "Members", icon: Users },
  { href: "/households", label: "Households", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ inSheet = false }: { inSheet?: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex-col bg-card",
        inSheet
          ? // inside the mobile drawer: a visible, full-height flex column
            "flex h-full w-full"
          : // desktop: a fixed left sidebar, hidden below md
            "hidden border-border border-r md:fixed md:inset-y-0 md:flex md:w-64",
      )}
    >
      <div className="flex h-16 items-center gap-2 border-border border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Home className="h-4 w-4" />
        </div>
        <span className="font-bold text-lg">Outlay</span>
      </div>

      <div className="border-border border-b px-3 py-3">
        <HouseholdSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-border border-t px-3 py-4">
        <ThemeToggle />
      </div>
    </aside>
  );
}
