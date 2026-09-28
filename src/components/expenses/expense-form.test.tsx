// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("ExpenseForm Split", () => {
  function renderCustom(amount: string) {
    const utils = render(
      <ExpenseForm categories={categories} members={members} />,
    );
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: amount },
    });
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    return utils;
  }

  it("starts split equally and posts no splits field", () => {
    const { container } = render(
      <ExpenseForm categories={categories} members={members} />,
    );
    expect(screen.getByRole("button", { name: "Equally" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector('input[name="splits"]')).toBeNull();
  });

  it("Custom shares the amount equally among everyone in settle-up", () => {
    const { container } = renderCustom("9");
    expect(screen.getByLabelText("Amma's share")).toHaveValue(3);
    expect(screen.getByLabelText("Bala's share")).toHaveValue(3);
    expect(screen.getByLabelText("Cara's share")).toHaveValue(3);
    expect(screen.getByText("Adds up")).toBeInTheDocument();
    const hidden = container.querySelector(
      'input[name="splits"]',
    ) as HTMLInputElement;
    expect(JSON.parse(hidden.value)).toEqual([
      { memberId: "a", amount: "3.00" },
      { memberId: "b", amount: "3.00" },
      { memberId: "c", amount: "3.00" },
    ]);
  });

  it("leaving someone out re-shares the amount among the rest", () => {
    renderCustom("9");
    fireEvent.click(screen.getByLabelText("Include Bala"));
    expect(screen.getByLabelText("Amma's share")).toHaveValue(4.5);
    expect(screen.getByLabelText("Bala's share")).toBeDisabled();
    expect(screen.getByLabelText("Cara's share")).toHaveValue(4.5);
  });

  it("flags shares that don't add up and blocks submit", () => {
    renderCustom("9");
    fireEvent.change(screen.getByLabelText("Amma's share"), {
      target: { value: "5" },
    });
    expect(screen.getByText(/over$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Expense" })).toBeDisabled();
  });

  it("editing a split expense opens in Custom with the saved shares", () => {
    render(
      <ExpenseForm
        categories={categories}
        members={members}
        expense={{
          id: "e1",
          amount: 10,
          description: "Dinner",
          date: "2026-01-01",
          categoryId: "c1",
          memberId: "a",
          notes: null,
          splits: [
            { memberId: "a", amount: 3 },
            { memberId: "c", amount: 7 },
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Amma's share")).toHaveValue(3);
    expect(screen.getByLabelText("Cara's share")).toHaveValue(7);
    expect(screen.getByLabelText("Include Bala")).not.toBeChecked();
    expect(screen.getByText("Adds up")).toBeInTheDocument();
  });

  it("typing the amount back to the saved total restores the saved shares", () => {
    render(
      <ExpenseForm
        categories={categories}
        members={members}
        expense={{
          id: "e1",
          amount: 10,
          description: "Dinner",
          date: "2026-01-01",
          categoryId: "c1",
          memberId: "a",
          notes: null,
          splits: [
            { memberId: "a", amount: 3 },
            { memberId: "c", amount: 7 },
          ],
        }}
      />,
    );
    const amount = screen.getByLabelText("Amount");
    fireEvent.change(amount, { target: { value: "100" } });
    expect(screen.getByLabelText("Amma's share")).toHaveValue(50);
    fireEvent.change(amount, { target: { value: "10" } });
    expect(screen.getByLabelText("Amma's share")).toHaveValue(3);
    expect(screen.getByLabelText("Cara's share")).toHaveValue(7);
  });

  it("explains and blocks Custom when the payer is not in settle-up", () => {
    // Amma is the default payer but not in settle-up; Bala and Cara are.
    const payerOut = members.map((m) =>
      m.id === "a" ? { ...m, includeInSettleUp: false } : m,
    );
    render(<ExpenseForm categories={categories} members={payerOut} />);
    expect(screen.getByRole("button", { name: "Custom" })).toBeDisabled();
    expect(
      screen.getByText(/Only an expense paid by someone in settle-up/),
    ).toBeInTheDocument();
    // Picking a payer who is in settle-up lifts the block.
    fireEvent.click(screen.getByRole("button", { name: /Cara/ }));
    expect(screen.getByRole("button", { name: "Custom" })).toBeEnabled();
  });

  it("keeps a saved split on screen even when only one person is left in settle-up", () => {
    const solo = members.map((m) => ({
      ...m,
      includeInSettleUp: m.id === "a",
    }));
    const { container } = render(
      <ExpenseForm
        categories={categories}
        members={solo}
        expense={{
          id: "e1",
          amount: 10,
          description: "Dinner",
          date: "2026-01-01",
          categoryId: "c1",
          memberId: "a",
          notes: null,
          splits: [{ memberId: "a", amount: 10 }],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector('input[name="splits"]')).not.toBeNull();
  });

  it("hides the split control when fewer than two people are in settle-up", () => {
    const solo = members.map((m, i) => ({ ...m, includeInSettleUp: i === 0 }));
    render(<ExpenseForm categories={categories} members={solo} />);
    expect(screen.queryByRole("button", { name: "Custom" })).toBeNull();
  });
});
