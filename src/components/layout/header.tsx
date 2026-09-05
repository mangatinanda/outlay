"use client";

import { LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { logout } from "@/lib/actions/auth-actions";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export interface HeaderUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function initials(user: HeaderUser | null) {
  return (user?.name || user?.email || "Guest").slice(0, 2).toUpperCase();
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(user: HeaderUser | null) {
  const name = user?.name?.trim();
  if (name) return name.split(" ")[0];
  return null;
}

export function Header({
  user,
  householdName,
  isSuperadmin = false,
  unreadCount = null,
}: {
  user: HeaderUser | null;
  householdName?: string | null;
  isSuperadmin?: boolean;
  unreadCount?: number | null;
}) {
  const name = firstName(user);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const lastPath = useRef(pathname);

  // Auto-close the mobile drawer on navigation. The sidebar links also close it
  // immediately via onNavigate (below); this effect is the safety net for any
  // other in-drawer navigation (e.g. the household switcher's links). pathname
  // is compared in the body so the lint autofixer keeps it as a real dep.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-border border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Open menu" />
                }
              >
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <Sidebar inSheet onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
          <div className="min-w-0">
            <p className="truncate font-display font-semibold text-sm leading-tight">
              {greeting()}
              {name ? `, ${name}` : ""}
            </p>
            <p className="truncate text-muted-foreground text-xs leading-tight">
              {householdName ?? "Outlay"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount !== null && (
            <NotificationBell initialCount={unreadCount} />
          )}
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-9 w-9 cursor-pointer rounded-full">
              <Avatar className="h-9 w-9">
                {user?.image && (
                  <AvatarImage src={user.image} alt={user.name ?? ""} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {initials(user)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="font-medium text-sm">
                      {user?.name ?? (isSuperadmin ? "Superadmin" : "Guest")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {user?.email ??
                        (isSuperadmin
                          ? "Signed in with passcode"
                          : "Not signed in")}
                    </p>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-destructive text-sm outline-hidden hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
