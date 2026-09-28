// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ updateExpenseNotifyThreshold: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/actions/settings-actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { ExpenseNotifyThreshold } from "./expense-notify-threshold";

describe("ExpenseNotifyThreshold", () => {
  it("keeps what was typed when the save is rejected", async () => {
    actions.updateExpenseNotifyThreshold.mockResolvedValue({
      error: "Only an admin can change this",
    });
    render(<ExpenseNotifyThreshold current={null} />);
    const input = screen.getByLabelText(/notify members/i);
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only an admin can change this"),
    );
    expect(input).toHaveValue(500);
  });

  it("starts from the saved threshold", () => {
    render(<ExpenseNotifyThreshold current={1200} />);
    expect(screen.getByLabelText(/notify members/i)).toHaveValue(1200);
  });
});
