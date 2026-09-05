"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  loadNotifications,
  markAllNotificationsRead,
} from "@/lib/actions/notification-actions";
import type { NotificationItemData } from "@/lib/queries/notification-queries";

const POLL_MS = 60_000;
const LOAD_FAILED = "Couldn't load notifications. Please try again.";

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState<NotificationItemData[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // Monotonic request sequence: on rapid open→close→reopen two list fetches
  // can be in flight; only the latest one may write to state.
  const seqRef = useRef(0);
  // Mirrors `open` for the poll (which closes over the first render).
  const openRef = useRef(false);

  // The (app) layout re-renders with a fresh server count after any
  // revalidating action (router.refresh(), revalidatePath) — adopt it rather
  // than waiting up to a minute for the next poll.
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  // Poll the unread count while the tab is visible. Silent on any failure —
  // the badge self-corrects on the next poll or server render.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      // While the menu is open everything is being marked read; a tick that
      // lands mid-way would write the pre-read count back over the zero.
      if (openRef.current) return;
      try {
        const res = await fetch("/api/notifications/count");
        if (
          !res.ok ||
          !res.headers.get("content-type")?.includes("application/json")
        )
          return;
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      } catch {
        // ignore — transient network/auth issues must not surface here
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  /** Fetch the dropdown list. Resolves false when the load failed. */
  async function refreshList(): Promise<boolean> {
    const seq = ++seqRef.current;
    const result = await loadNotifications();
    if (seq !== seqRef.current) return true; // stale response — a newer fetch won
    if (result && "items" in result) {
      setItems(result.items);
      setLoadFailed(false);
      return true;
    }
    setItems([]);
    setLoadFailed(true);
    toast.error(result && "error" in result ? result.error : LOAD_FAILED);
    return false;
  }

  async function onOpenChange(next: boolean) {
    setOpen(next);
    openRef.current = next;
    if (!next) return;
    const previous = count;
    setCount(0); // optimistic — mark-all-read follows once the list is shown
    setItems(null);
    setLoadFailed(false);
    try {
      if (!(await refreshList())) {
        setCount(previous); // nothing was shown, so nothing is read
        return;
      }
      await markAllNotificationsRead();
    } catch {
      // A network-level rejection of the RPC itself (safeAction only wraps
      // errors thrown inside the action body).
      setItems((current) => current ?? []);
      setLoadFailed(true);
      setCount(previous);
      toast.error(LOAD_FAILED);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              count > 0 ? `Notifications (${count} unread)` : "Notifications"
            }
            className="relative"
          />
        }
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <p className="px-4 pt-3 pb-2 font-display font-semibold text-sm">
          Notifications
        </p>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto p-1">
          {items === null ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : loadFailed ? (
            <p className="p-4 text-muted-foreground text-sm">{LOAD_FAILED}</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">
              You're all caught up.
            </p>
          ) : (
            items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                onActioned={refreshList}
              />
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block min-h-11 px-4 py-3 text-center font-medium text-primary text-sm hover:bg-muted"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
