import { describe, expect, it } from "vitest";
import { visiblePayers } from "@/lib/members";

const members = [
  { id: "a", name: "Amma", showInPaidBy: true },
  { id: "b", name: "Bala", showInPaidBy: false },
  { id: "c", name: "Cara", showInPaidBy: true },
];

describe("visiblePayers", () => {
  it("drops members hidden from Paid by", () => {
    expect(visiblePayers(members).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("keeps the current payer of an existing expense even when hidden", () => {
    // Editing an old expense must never silently reassign it.
    expect(visiblePayers(members, "b").map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores a keep id that matches nobody", () => {
    expect(visiblePayers(members, "zzz").map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list when everyone is hidden", () => {
    const hidden = members.map((m) => ({ ...m, showInPaidBy: false }));
    expect(visiblePayers(hidden)).toEqual([]);
  });
});
