// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/notification-actions", () => ({
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { NotificationItemData } from "@/lib/queries/notification-queries";
import { NotificationItem } from "./notification-item";

const base: NotificationItemData = {
  id: "n1",
  type: "expense.large",
  householdId: "h1",
  payload: {
    amountMinor: 500000,
    currency: "INR",
    description: "Sofa",
    actorLabel: "Amma",
    householdName: "Home",
  },
  readAt: null,
  createdAt: Date.now(),
};

describe("NotificationItem", () => {
  it("flags an unread item for assistive tech and styling", () => {
    render(<NotificationItem item={base} />);
    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByText(/Large expense/)).toBeInTheDocument();
  });

  it("renders a read item without the flag", () => {
    render(<NotificationItem item={{ ...base, readAt: Date.now() }} />);
    expect(screen.queryByText("Unread")).toBeNull();
  });
});
