"use client";

import { LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
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

export function Header({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-border border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Sidebar inSheet />
            </SheetContent>
          </Sheet>
          <span className="font-bold text-lg">Outlay</span>
        </div>

        <div className="hidden md:block" />

        <div className="flex items-center gap-2">
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
                      {user?.name ?? "Guest"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {user?.email ?? "Signed in with passcode"}
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
