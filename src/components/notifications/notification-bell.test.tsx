// @vitest-environment happy-dom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/actions/notification-actions", () => actions);
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault(); // no happy-dom navigation
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));
// Base UI's popover needs real pointer/portal plumbing; a plain stand-in keeps
// the test about the bell's own state machine (open → load → mark read).
vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onOpenChange(true)}>
        open-menu
      </button>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

import type { NotificationItemData } from "@/lib/queries/notification-queries";
import { NotificationBell } from "./notification-bell";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("NotificationBell", () => {
  beforeEach(() => {
    actions.loadNotifications.mockReset();
    actions.markAllNotificationsRead.mockReset().mockResolvedValue({
      success: true,
    });
    actions.acceptInvite.mockReset();
    toast.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the badge and does not mark anything read when the list fails to load", async () => {
    actions.loadNotifications.mockResolvedValue({ error: "boom" });
    render(<NotificationBell initialCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByText("open-menu"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(actions.markAllNotificationsRead).not.toHaveBeenCalled();
    // Not stuck on the loading state, and the unread count is not lost.
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("re-syncs the badge when the server passes a fresh count", () => {
    const { rerender } = render(<NotificationBell initialCount={0} />);
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    rerender(<NotificationBell initialCount={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("ignores a poll tick that lands while the menu is open", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ count: 7 })),
    );
    actions.loadNotifications.mockResolvedValue({ success: true, items: [] });
    render(<NotificationBell initialCount={2} />);

    fireEvent.click(screen.getByText("open-menu"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("2")).not.toBeInTheDocument(); // optimistic 0

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // The stale server count must not resurrect a badge for items just read.
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("resumes polling after View all closes the popup", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    actions.loadNotifications.mockResolvedValue({ success: true, items: [] });
    render(<NotificationBell initialCount={0} />);

    fireEvent.click(screen.getByText("open-menu"));
    await act(async () => {
      await Promise.resolve();
    });
    // Closing via the link (not the popover's own dismiss) must also lift the
    // "open" guard on the poll, or polling stays suspended for good.
    fireEvent.click(screen.getByText("View all"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/count");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("keeps the unread highlight after an invite is actioned", async () => {
    const invite: NotificationItemData = {
      id: "n1",
      type: "invite.received",
      householdId: "h1",
      payload: { memberId: "m1", householdName: "Home", invitedBy: "Amma" },
      readAt: null,
      createdAt: Date.now(),
      inviteState: "pending",
    };
    actions.loadNotifications
      .mockResolvedValueOnce({ success: true, items: [invite] })
      // The refetch after Accept: everything was marked read on open.
      .mockResolvedValueOnce({
        success: true,
        items: [{ ...invite, readAt: Date.now(), inviteState: "accepted" }],
      });
    actions.acceptInvite.mockResolvedValue({ success: true });
    render(<NotificationBell initialCount={1} />);

    fireEvent.click(screen.getByText("open-menu"));
    await waitFor(() => expect(screen.getByText("Unread")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(actions.loadNotifications).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(screen.getByText("Accepted")).toBeInTheDocument(),
    );
    // Still presented as new while the popup stays open.
    expect(screen.getByText("Unread")).toBeInTheDocument();
  });
});
