"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  Tags,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/expenses/new", label: "Add", icon: PlusCircle },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/members", label: "Members", icon: Users },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/expenses/new"
              ? pathname === "/expenses/new"
              : pathname.startsWith(item.href);
          const isAdd = item.href === "/expenses/new";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors",
                isAdd && "relative -top-3",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {isAdd ? (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg">
                  <item.icon className="h-6 w-6" />
                </div>
              ) : (
                <item.icon className="h-5 w-5" />
              )}
              <span className={cn(isAdd && "mt-1")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
