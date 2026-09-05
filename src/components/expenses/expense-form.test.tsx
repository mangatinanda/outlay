// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/expense-actions", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { Category, HouseholdMember } from "@/lib/db/schema";
import { ExpenseForm } from "./expense-form";

const categories = [
  {
    id: "c1",
    householdId: "h1",
    name: "General",
    icon: "Tag",
    color: "#000",
    isDefault: true,
    createdAt: new Date(),
  },
] as Category[];

function member(id: string, name: string, showInPaidBy: boolean) {
  return {
    id,
    householdId: "h1",
    userId: null,
    email: null,
    name,
    avatar: null,
    role: "member",
    includeInSettleUp: true,
    showInPaidBy,
    createdAt: new Date(),
  } as HouseholdMember;
}

const members = [
  member("a", "Amma", true),
  member("b", "Bala", false),
  member("c", "Cara", true),
];

describe("ExpenseForm Paid by", () => {
  it("offers only members shown in Paid by", () => {
    render(<ExpenseForm categories={categories} members={members} />);
    expect(screen.getByRole("button", { name: /Amma/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cara/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bala/ })).toBeNull();
  });

  it("keeps a hidden member selectable while editing their expense", () => {
    render(
      <ExpenseForm
        categories={categories}
        members={members}
        expense={{
          id: "e1",
          amount: 10,
          description: "Old",
          date: "2026-01-01",
          categoryId: "c1",
          memberId: "b",
          notes: null,
        }}
      />,
    );
    const bala = screen.getByRole("button", { name: /Bala/ });
    expect(bala).toHaveAttribute("aria-pressed", "true");
  });

  it("explains when nobody is shown in Paid by", () => {
    const hidden = members.map((m) => ({ ...m, showInPaidBy: false }));
    render(<ExpenseForm categories={categories} members={hidden} />);
    expect(screen.queryByRole("button", { name: /Amma/ })).toBeNull();
    expect(screen.getByText(/Members/)).toBeInTheDocument();
  });
});
