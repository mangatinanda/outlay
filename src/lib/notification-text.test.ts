import { describe, expect, it } from "vitest";
import { formatMinor, notificationText } from "@/lib/notification-text";

const base = { id: "n1", householdId: "h1", readAt: null, createdAt: 0 };

describe("notificationText", () => {
  it("invite.received", () => {
    const { title, detail } = notificationText({
      ...base,
      type: "invite.received",
      payload: { memberId: "m1", householdName: "Home", invitedBy: "Nanda" },
    });
    expect(title).toBe("Invitation to Home");
    expect(detail).toBe("Nanda invited you to join this household");
  });

  it("settlement.recorded formats the amount in the payload currency", () => {
    const { title, detail } = notificationText({
      ...base,
      type: "settlement.recorded",
      payload: {
        amountMinor: 50000,
        currency: "INR",
        fromName: "Alice",
        toName: "Bob",
        householdName: "Home",
      },
    });
    expect(title).toBe("Payment recorded in Home");
    expect(detail).toContain("Alice");
    expect(detail).toContain("Bob");
    expect(detail).toContain("500");
  });

  it("expense.large includes description and actor", () => {
    const { detail } = notificationText({
      ...base,
      type: "expense.large",
      payload: {
        amountMinor: 123456,
        currency: "INR",
        description: "New sofa",
        actorLabel: "Bob",
        householdName: "Home",
      },
    });
    expect(detail).toContain("Bob");
    expect(detail).toContain("New sofa");
  });

  it("falls back to a generic label for an unknown type instead of crashing", () => {
    const { title, detail } = notificationText({
      ...base,
      // A row written by a newer build (no CHECK constraint on the column).
      type: "expense.updated" as never,
      payload: { householdName: "Home" },
    });
    expect(title.length).toBeGreaterThan(0);
    expect(detail.length).toBeGreaterThan(0);
  });

  it("tolerates a missing/garbled payload", () => {
    const { title } = notificationText({
      ...base,
      type: "invite.accepted",
      payload: {},
    });
    expect(title.length).toBeGreaterThan(0);
  });
});

describe("formatMinor", () => {
  it("matches the app-wide currency formatter per currency", () => {
    // INR keeps lakh grouping; other currencies use their own conventions
    // (en-US grouping, JPY without decimals) — same as every other amount.
    expect(formatMinor(15000000, "INR")).toBe("₹1,50,000.00");
    expect(formatMinor(15000000, "USD")).toBe("$150,000.00");
    expect(formatMinor(123456, "JPY")).toBe("¥1,235");
  });
});
