/**
 * Pure export formatters. Reused by CSV (sync, here), XLSX, and PDF formatters.
 * No DOM, no heavy libs — safe to unit-test and to import on the server.
 */

export interface ExpenseRecord {
  date: string;
  description: string;
  categoryName: string;
  memberName: string;
  amount: number;
  notes: string | null;
}

export interface ExportRow {
  Date: string;
  Description: string;
  Category: string;
  Member: string;
  Amount: number;
  Notes: string;
}

export const EXPORT_COLUMNS = [
  "Date",
  "Description",
  "Category",
  "Member",
  "Amount",
  "Notes",
] as const satisfies readonly (keyof ExportRow)[];

export function formatRows(records: ExpenseRecord[]): ExportRow[] {
  return records.map((r) => ({
    Date: r.date,
    Description: r.description,
    Category: r.categoryName,
    Member: r.memberName,
    Amount: r.amount,
    Notes: r.notes ?? "",
  }));
}

function csvEscape(value: string | number): string {
  const s = String(value);
  // RFC 4180: wrap in quotes if it contains comma, quote, CR, or LF; double inner quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ExportRow[]): string {
  const header = EXPORT_COLUMNS.join(",");
  if (rows.length === 0) return header;
  const body = rows
    .map((row) => EXPORT_COLUMNS.map((col) => csvEscape(row[col])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/** Lowercase + hyphenate, drop non-alphanumerics. Used for download filenames. */
function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function safeFilename(
  householdName: string,
  isoDate: string,
  ext: "csv" | "xlsx" | "pdf",
): string {
  const namePart = slug(householdName) || "household";
  return `outlay-${namePart}-${isoDate}.${ext}`;
}
