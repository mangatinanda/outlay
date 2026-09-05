import { formatCurrency } from "@/components/shared/currency-display";
import { MINOR_UNITS_PER_MAJOR } from "@/lib/money";
import type { NotificationItemData } from "@/lib/queries/notification-queries";

/** Format minor units in the currency snapshotted at emit time (notifications
 *  span households, so the active household's CurrencyProvider is wrong here —
 *  but the per-currency locale rules must match every other amount). */
export function formatMinor(amountMinor: number, currency: string): string {
  const major = amountMinor / MINOR_UNITS_PER_MAJOR;
  try {
    return formatCurrency(major, currency);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v ? v : fallback;
const num = (v: unknown) => (typeof v === "number" ? v : 0);

/** One-line title + detail per notification type. Pure and defensive: any
 *  missing payload field degrades to a generic label, never a crash. */
export function notificationText(item: NotificationItemData): {
  title: string;
  detail: string;
} {
  const p = item.payload;
  const household = str(p.householdName, "a household");
  switch (item.type) {
    case "invite.received":
      return {
        title: `Invitation to ${household}`,
        detail: `${str(p.invitedBy, "Someone")} invited you to join this household`,
      };
    case "invite.accepted":
      return {
        title: `Invite accepted in ${household}`,
        detail: `${str(p.accepterName, "Someone")} joined the household`,
      };
    case "invite.declined":
      return {
        title: `Invite declined in ${household}`,
        detail: `${str(p.invitedEmail, "Someone")} declined the invitation`,
      };
    case "settlement.recorded":
      return {
        title: `Payment recorded in ${household}`,
        detail: `${str(p.fromName, "Someone")} paid ${formatMinor(num(p.amountMinor), str(p.currency, "INR"))} to ${str(p.toName, "someone")}`,
      };
    case "expense.large":
      return {
        title: `Large expense in ${household}`,
        detail: `${str(p.actorLabel, "Someone")} added "${str(p.description, "an expense")}" — ${formatMinor(num(p.amountMinor), str(p.currency, "INR"))}`,
      };
    default:
      // A row written by a newer build (the column has no CHECK constraint)
      // must degrade gracefully rather than blank the whole app shell.
      return {
        title: `Update in ${household}`,
        detail: "Open Outlay for details",
      };
  }
}
