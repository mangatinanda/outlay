import { describe, expect, it } from "vitest";
import { buildUpiPayLink, formatUpiAmount } from "./upi";

/** `new URL("upi://…")` parses the query of a custom scheme in Node. */
function param(link: string, key: string) {
  return new URL(link).searchParams.get(key) ?? "";
}

describe("formatUpiAmount", () => {
  it.each([
    [124000, "1240.00"],
    [5, "0.05"],
    [100000000, "1000000.00"],
    [199, "1.99"],
  ])("%i minor → %s", (minor, text) => {
    expect(formatUpiAmount(minor)).toBe(text);
  });

  it.each([0, -100, 12.5, Number.NaN])("throws on %s", (minor) => {
    expect(() => formatUpiAmount(minor)).toThrow();
  });
});

describe("buildUpiPayLink", () => {
  it("builds the NPCI link with parameters in order", () => {
    expect(
      buildUpiPayLink({
        payeeVpa: "priya@okaxis",
        payeeName: "Priya",
        amountMinor: 124000,
        note: "Outlay · Home",
      }),
    ).toBe(
      "upi://pay?pa=priya@okaxis&pn=Priya&am=1240.00&cu=INR&tn=Outlay%20%C2%B7%20Home",
    );
  });

  it("keeps the payee VPA raw: the @ stays unencoded as in NPCI QR codes", () => {
    const link = buildUpiPayLink({
      payeeVpa: "9876543210@ybl",
      payeeName: "x",
      amountMinor: 100,
      note: "n",
    });
    expect(link.startsWith("upi://pay?pa=9876543210@ybl&")).toBe(true);
  });

  it("encodes reserved and non-ASCII characters in name and note", () => {
    const link = buildUpiPayLink({
      payeeVpa: "a@b",
      payeeName: "R&D #1=ok",
      amountMinor: 100,
      note: "घर",
    });
    expect(link).toContain("pn=R%26D%20%231%3Dok");
    expect(link).toContain("tn=%E0%A4%98%E0%A4%B0");
    expect(link.split("&")).toHaveLength(5);
  });

  it("trims name and note to 50 code points without splitting a character", () => {
    const link = buildUpiPayLink({
      payeeVpa: "a@b",
      payeeName: "अ".repeat(60),
      amountMinor: 100,
      note: "x".repeat(80),
    });
    expect(Array.from(param(link, "pn"))).toHaveLength(50);
    expect(param(link, "tn")).toHaveLength(50);
  });
});
