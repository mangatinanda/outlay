/**
 * Pure helpers for "Pay via UPI": the NPCI `upi://pay` deep link, which is
 * also exactly what a UPI QR code encodes. No I/O, no money math beyond
 * rendering an integer minor-unit amount as "1240.00".
 */

/** Several UPI apps truncate or reject longer payee names / notes. */
export const UPI_TEXT_LIMIT = 50;

/** `124000` → `"1240.00"`. Built from the integer, never from a float. */
export function formatUpiAmount(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError(
      `UPI amount must be a positive integer of minor units, got ${amountMinor}`,
    );
  }
  const major = Math.floor(amountMinor / 100);
  const minor = String(amountMinor % 100).padStart(2, "0");
  return `${major}.${minor}`;
}

/** Trim to UPI_TEXT_LIMIT code points (never splits a multi-byte character). */
function clip(text: string): string {
  return Array.from(text.trim()).slice(0, UPI_TEXT_LIMIT).join("");
}

export function buildUpiPayLink(input: {
  payeeVpa: string;
  payeeName: string;
  amountMinor: number;
  note: string;
}): string {
  // Fixed order; encodeURIComponent (not URLSearchParams) so spaces are %20.
  // NPCI QR codes carry `pa=name@bank` with a literal `@`, so the `@` is put
  // back after encoding. Everything else in the VPA is encoded here as well,
  // so the helper is safe on its own even if a row bypassed UPI_ID_PATTERN.
  const pairs: [string, string][] = [
    ["pa", encodeURIComponent(input.payeeVpa).replace(/%40/g, "@")],
    ["pn", encodeURIComponent(clip(input.payeeName))],
    ["am", formatUpiAmount(input.amountMinor)],
    ["cu", "INR"],
    ["tn", encodeURIComponent(clip(input.note))],
  ];
  return `upi://pay?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`;
}
