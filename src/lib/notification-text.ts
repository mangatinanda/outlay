import type { NotificationItemData } from "@/lib/queries/notification-queries";

/** Format minor units in the currency snapshotted at emit time (notifications
 *  span households, so the active household's CurrencyProvider is wrong here). */
export function formatMinor(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
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
  }
}
