"use client";

import { Download, FileSpreadsheet, FileText, Table } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadBlob } from "@/lib/export/download";
import {
  type ExpenseRecord,
  formatRows,
  safeFilename,
  toCsv,
} from "@/lib/export/format";

interface ExportButtonProps {
  records: ExpenseRecord[];
  householdName: string;
}

export function ExportButton({ records, householdName }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function exportAs(format: "csv" | "xlsx" | "pdf") {
    if (records.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setBusy(true);
    try {
      const rows = formatRows(records);
      const isoDate = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
      const filename = safeFilename(householdName, isoDate, format);

      let blob: Blob;
      if (format === "csv") {
        blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
      } else if (format === "xlsx") {
        const { toXlsxBlob } = await import("@/lib/export/xlsx");
        blob = await toXlsxBlob(rows);
      } else {
        const { toPdfBlob } = await import("@/lib/export/pdf");
        blob = await toPdfBlob(rows, { householdName, isoDate });
      }

      downloadBlob(blob, filename);
      toast.success(
        `Exported ${records.length} expense${records.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.error("[export] failed", err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            disabled={busy}
            aria-label="Export expenses"
          />
        }
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => exportAs("csv")}>
          <FileText className="h-4 w-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs("xlsx")}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs("pdf")}>
          <Table className="h-4 w-4" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
