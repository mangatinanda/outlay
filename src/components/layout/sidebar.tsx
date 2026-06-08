"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Tags,
  Users,
  Settings,
  Home,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { HouseholdSwitcher } from "./household-switcher";

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
            "hidden border-r border-border md:flex md:w-64 md:fixed md:inset-y-0"
      )}
    >
      <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
          <Home className="h-4 w-4" />
        </div>
        <span className="text-lg font-bold">Outlay</span>
      </div>

      <div className="px-3 py-3 border-b border-border">
        <HouseholdSwitcher />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <ThemeToggle />
      </div>
    </aside>
  );
}
