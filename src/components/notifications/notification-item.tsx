"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  HandCoins,
  type LucideIcon,
  ReceiptText,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  acceptInvite,
  declineInvite,
} from "@/lib/actions/notification-actions";
import { notificationText } from "@/lib/notification-text";
import type { NotificationItemData } from "@/lib/queries/notification-queries";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationItemData["type"], LucideIcon> = {
  "invite.received": UserPlus,
  "invite.accepted": UserCheck,
  "invite.declined": UserX,
  "settlement.recorded": HandCoins,
  "expense.large": ReceiptText,
};

export function NotificationItem({
  item,
  onActioned,
}: {
  item: NotificationItemData;
  onActioned?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(
    null,
  );
  const Icon = ICONS[item.type] ?? Bell;
  const { title, detail } = notificationText(item);
  // The bell loads the list BEFORE marking everything read, so the rows it
  // shows still carry readAt=null and get the "new" treatment while open; on
  // /notifications (which never marks read) the flag persists until the bell
  // is next opened.
  const unread = item.readAt === null;
  const memberId =
    typeof item.payload.memberId === "string" ? item.payload.memberId : null;
  const pending =
    item.type === "invite.received" &&
    item.inviteState === "pending" &&
    !resolved &&
    memberId !== null;

  async function act(kind: "accept" | "decline") {
    if (!memberId) return;
    setBusy(true);
    try {
      const action = kind === "accept" ? acceptInvite : declineInvite;
      const result = await action(memberId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setResolved(kind === "accept" ? "accepted" : "declined");
      toast.success(kind === "accept" ? "Invite accepted" : "Invite declined");
      if (kind === "accept") router.refresh();
      onActioned?.();
    } catch {
      // safeAction only wraps errors thrown inside the action body; a
      // network-level rejection of the RPC itself lands here.
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("flex gap-3 rounded-xl p-3", unread && "bg-primary/5")}
      data-unread={unread || undefined}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm leading-tight",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {title}
          {unread && (
            <>
              <span
                aria-hidden
                className="ml-2 inline-block size-2 rounded-full bg-primary align-middle"
              />
              <span className="sr-only">Unread</span>
            </>
          )}
        </p>
        <p className="text-muted-foreground text-sm">{detail}</p>
        {/* Relative time is computed at render; the server and the client
            legitimately disagree by a few seconds (or a threshold), so tell
            React not to treat that as a hydration mismatch. */}
        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </p>
        {pending && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="min-h-11 flex-1"
              disabled={busy}
              onClick={() => act("accept")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 flex-1"
              disabled={busy}
              onClick={() => act("decline")}
            >
              Decline
            </Button>
          </div>
        )}
        {item.type === "invite.received" && !pending && (
          <p className="text-muted-foreground text-xs">
            {resolved === "accepted" || item.inviteState === "accepted"
              ? "Accepted"
              : resolved === "declined"
                ? "Declined"
                : "No longer available"}
          </p>
        )}
      </div>
    </div>
  );
}
