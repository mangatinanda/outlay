// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/activity",
  useSearchParams: () => searchParams.current,
}));

// Base UI's Select needs real pointer/portal plumbing to open; a plain
// stand-in exposes every option as a button so the test stays about the
// component's own contract: which options exist and what lands in the URL.
vi.mock("@/components/ui/select", async () => {
  const { createContext, useContext } = await import("react");
  const Ctx = createContext<(value: string | null) => void>(() => {});
  return {
    Select: ({
      value,
      onValueChange,
      items,
      children,
    }: {
      value: string;
      onValueChange: (value: string | null) => void;
      items?: Record<string, string>;
      children: React.ReactNode;
    }) => (
      <Ctx.Provider value={onValueChange}>
        <div
          data-testid="select"
          data-value={value}
          // What the real trigger shows while closed: the items label.
          data-label={items?.[value]}
        >
          {children}
        </div>
      </Ctx.Provider>
    ),
    SelectTrigger: ({
      children,
      id,
    }: {
      children: React.ReactNode;
      id?: string;
    }) => <div id={id}>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const onValueChange = useContext(Ctx);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

import { ActivityActorFilter } from "./activity-actor-filter";

const actors = ["Admin", "Nanda"];

describe("ActivityActorFilter", () => {
  beforeEach(() => {
    router.replace.mockClear();
    searchParams.current = new URLSearchParams();
  });

  it("offers Everyone plus each actor, and puts a choice in the URL", () => {
    render(<ActivityActorFilter actors={actors} />);
    expect(
      screen.getByRole("button", { name: "Everyone" }),
    ).toBeInTheDocument();
    // The closed trigger must read "Everyone", not the sentinel value.
    expect(screen.getByTestId("select")).toHaveAttribute(
      "data-label",
      "Everyone",
    );
    fireEvent.click(screen.getByRole("button", { name: "Nanda" }));
    expect(router.replace).toHaveBeenCalledWith("/activity?actor=Nanda", {
      scroll: false,
    });
  });

  it("choosing Everyone drops only the actor param", () => {
    searchParams.current = new URLSearchParams("actor=Nanda");
    render(<ActivityActorFilter actors={actors} actor="Nanda" />);
    fireEvent.click(screen.getByRole("button", { name: "Everyone" }));
    expect(router.replace).toHaveBeenCalledWith("/activity", { scroll: false });
  });

  it("keeps a URL actor selectable even when the feed no longer lists them", () => {
    render(<ActivityActorFilter actors={actors} actor="Ghost" />);
    expect(screen.getByTestId("select")).toHaveAttribute("data-value", "Ghost");
    expect(screen.getByTestId("select")).toHaveAttribute("data-label", "Ghost");
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
  });
});
