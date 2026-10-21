import { describe, expect, it } from "vitest";
import { memberSchema, UPI_ID_ERROR } from "./member-schema";

const base = { name: "Priya", role: "member" };

describe("memberSchema.upiId", () => {
  it("is absent when the field is missing, empty, blank or null", () => {
    expect(memberSchema.parse(base).upiId).toBeUndefined();
    expect(memberSchema.parse({ ...base, upiId: "" }).upiId).toBeUndefined();
    expect(memberSchema.parse({ ...base, upiId: "   " }).upiId).toBeUndefined();
    expect(memberSchema.parse({ ...base, upiId: null }).upiId).toBeUndefined();
  });

  it("trims and lowercases", () => {
    expect(
      memberSchema.parse({ ...base, upiId: " Name.Surname@OKAXIS " }).upiId,
    ).toBe("name.surname@okaxis");
  });

  it.each([
    "name@bank",
    "9876543210@ybl",
    "a-b_c.d@paytm",
  ])("accepts %s", (v) => {
    expect(memberSchema.safeParse({ ...base, upiId: v }).success).toBe(true);
  });

  it.each([
    "name@",
    "@bank",
    "name bank@upi",
    "name@b@nk",
    "name@1bank",
  ])("rejects %s", (v) => {
    const r = memberSchema.safeParse({ ...base, upiId: v });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe(UPI_ID_ERROR);
  });
});
