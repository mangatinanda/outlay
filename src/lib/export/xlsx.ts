import { EXPORT_COLUMNS, type ExportRow } from "./format";

/**
 * Build an .xlsx Blob from already-formatted rows. exceljs is dynamic-imported
 * so it only loads when the user actually exports — keeps the /expenses bundle
 * lean for the common read path.
 */
export async function toXlsxBlob(
  rows: ExportRow[],
  sheetName = "Expenses",
): Promise<Blob> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName);

  ws.columns = EXPORT_COLUMNS.map((col) => ({
    header: col,
    key: col,
    width: col === "Description" || col === "Notes" ? 32 : 14,
  }));
  ws.getRow(1).font = { bold: true };

  for (const row of rows) ws.addRow(row);

  // Format the Amount column with 2 decimal places (locale-agnostic numeric).
  const amountCol = ws.getColumn("Amount");
  amountCol.numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
