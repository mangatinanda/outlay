/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded commas,
 * escaped quotes (`""`), CRLF/LF line endings, and newlines inside quoted
 * fields. Returns an array of rows, each an array of string cells. A leading
 * UTF-8 BOM is stripped. Trailing blank line produces no extra row.
 *
 * Deliberately dependency-free: the app already hand-rolls small utilities
 * (money.ts, allow-list.ts) rather than pulling a package for one feature.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // any char seen on the current row (so we know to flush)

  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // strip BOM

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      started = true;
    } else if (c === ",") {
      endField();
      started = true;
    } else if (c === "\n") {
      endRow();
    } else if (c === "\r") {
      // CRLF: let the following \n end the row; lone \r ends it here.
      if (text[i + 1] !== "\n") endRow();
    } else {
      field += c;
      started = true;
    }
  }

  // Flush a final row that had no trailing newline.
  if (started || field.length > 0 || row.length > 0) endRow();
  return rows;
}
