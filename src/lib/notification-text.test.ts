import { describe, expect, it } from "vitest";
import { notificationText } from "@/lib/notification-text";

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

  it("tolerates a missing/garbled payload", () => {
    const { title } = notificationText({
      ...base,
      type: "invite.accepted",
      payload: {},
    });
    expect(title.length).toBeGreaterThan(0);
  });
});
