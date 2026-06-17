import { EXPORT_COLUMNS, type ExportRow } from "./format";

/**
 * Build a PDF Blob with one table page per ~30 rows. jspdf + jspdf-autotable
 * are dynamic-imported so the libraries only load when the user clicks export.
 */
export async function toPdfBlob(
  rows: ExportRow[],
  opts: { householdName: string; isoDate: string },
): Promise<Blob> {
  const [{ default: jsPDF }, autoTable] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable").then((m) => m.default),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(`Outlay — ${opts.householdName}`, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Exported ${opts.isoDate}`, 40, 56);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 72,
    head: [EXPORT_COLUMNS as unknown as string[]],
    body: rows.map((row) =>
      EXPORT_COLUMNS.map((col) => {
        const v = row[col];
        if (col === "Amount")
          return v.toLocaleString("en-IN", { minimumFractionDigits: 2 });
        return String(v);
      }),
    ),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 30, 30] },
    columnStyles: { 4: { halign: "right" } }, // Amount column right-aligned
  });

  return doc.output("blob");
}
