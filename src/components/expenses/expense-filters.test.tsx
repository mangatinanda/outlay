// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/expenses",
  useSearchParams: () => searchParams.current,
}));

import { ExpenseFilters } from "./expense-filters";

const categories = [
  { id: "c1", name: "Groceries" },
  { id: "c2", name: "Travel" },
];
const members = [
  { id: "m1", name: "Amma" },
  { id: "m2", name: "Appa" },
];

function setUrl(qs: string) {
  searchParams.current = new URLSearchParams(qs);
}

describe("ExpenseFilters", () => {
  beforeEach(() => {
    router.replace.mockClear();
    setUrl("");
  });

  it("shows no chips and no count when nothing is filtered", () => {
    render(<ExpenseFilters categories={categories} members={members} />);
    expect(screen.queryByRole("button", { name: /Clear all/ })).toBeNull();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("renders a chip per active filter, naming the category and member", () => {
    setUrl("category=c1&member=m2&q=sofa");
    render(<ExpenseFilters categories={categories} members={members} />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Appa")).toBeInTheDocument();
    expect(screen.getByText(/sofa/)).toBeInTheDocument();
  });

  it("shows one chip for a date range, not two", () => {
    setUrl("from=2026-01-01&to=2026-01-31");
    render(<ExpenseFilters categories={categories} members={members} />);
    expect(screen.getAllByText(/2026/)).toHaveLength(1);
  });

  it("removing a chip drops only that filter from the URL", () => {
    setUrl("category=c1&q=sofa");
    render(<ExpenseFilters categories={categories} members={members} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove Groceries/ }));
    expect(router.replace).toHaveBeenCalledWith("/expenses?q=sofa", {
      scroll: false,
    });
  });

  it("Clear all returns to the bare path", () => {
    setUrl("category=c1&q=sofa&from=2026-01-01");
    render(<ExpenseFilters categories={categories} members={members} />);
    fireEvent.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(router.replace).toHaveBeenCalledWith("/expenses", { scroll: false });
  });

  it("labels a filter whose target was deleted without crashing", () => {
    // A shared link can name a category that has since been removed.
    setUrl("category=gone");
    render(<ExpenseFilters categories={categories} members={members} />);
    expect(screen.getByRole("button", { name: /Remove/ })).toBeInTheDocument();
  });
});
