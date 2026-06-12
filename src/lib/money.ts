/**
 * Money is stored as integer minor units (paise/cents — fixed scale of 100,
 * independent of the display currency, which is reformat-only). Integers sum
 * exactly in SQL; floats don't. Queries convert back to major units with a
 * single `/ 100.0` at the aggregate/row boundary.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

/** "12.34" major units → 1234 minor units. Input is validated to ≤ 2dp. */
export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * MINOR_UNITS_PER_MAJOR);
}
