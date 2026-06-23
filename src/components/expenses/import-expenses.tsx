"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ImportResult,
  importExpenses,
} from "@/lib/actions/import-actions";
import { parseCsv } from "@/lib/import/csv";
import {
  type ColumnRole,
  categorize,
  detectColumns,
  humanizeEmail,
  parseDmyToIso,
} from "@/lib/import/parse";
import { withProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

const ALL_KEY = "__all__"; // member key for rows with no email column/value

interface ImportExpensesProps {
  existingCategories: string[];
  members: Array<{ id: string; name: string; email: string | null }>;
}

type Parsed = { headers: string[]; data: string[][] };

type MemberChoice =
  | { mode: "existing"; memberId: string }
  | { mode: "new"; newName: string };

const ROLE_LABELS: Record<ColumnRole, string> = {
  amount: "Amount",
  date: "Date",
  description: "Description",
  method: "Payment method",
  email: "Contributor (email)",
};

const numberFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function selectClass() {
  return cn(
    "h-11 w-full rounded-md border border-input bg-card px-2 text-sm",
    "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
  );
}

export function ImportExpenses({
  existingCategories,
  members,
}: ImportExpensesProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<ColumnRole, number>>({
    amount: -1,
    date: -1,
    description: -1,
    method: -1,
    email: -1,
  });
  const [memberChoices, setMemberChoices] = useState<
    Record<string, MemberChoice>
  >({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    file
      .text()
      .then((text) => {
        const all = parseCsv(text);
        const headers = all[0] ?? [];
        const data = all
          .slice(1)
          .filter((row) => row.some((cell) => cell.trim() !== ""));
        if (headers.length === 0 || data.length === 0) {
          toast.error("That file has no data rows.");
          return;
        }
        setFileName(file.name);
        setParsed({ headers, data });
        setMapping(detectColumns(headers));
        setMemberChoices({});
        setResult(null);
      })
      .catch(() => toast.error("Could not read that file."));
  }

  // Derive normalized rows from the current column mapping.
  const derived = useMemo(() => {
    if (!parsed) return [];
    const cell = (row: string[], idx: number) =>
      idx >= 0 ? (row[idx] ?? "").trim() : "";
    return parsed.data.map((row) => {
      const description = cell(row, mapping.description);
      const rawAmount = cell(row, mapping.amount).replace(/[,₹\s]/g, "");
      const amount = Number(rawAmount);
      const date = parseDmyToIso(cell(row, mapping.date));
      const email = cell(row, mapping.email);
      const method = cell(row, mapping.method);
      let error: string | null = null;
      if (!description) error = "Missing description";
      else if (!rawAmount || Number.isNaN(amount) || amount <= 0)
        error = "Invalid amount";
      else if (!date) error = "Invalid/again missing date";
      return {
        date,
        amount,
        description,
        method,
        email,
        category: description ? categorize(description) : "Other",
        error,
      };
    });
  }, [parsed, mapping]);

  const validRows = useMemo(() => derived.filter((r) => !r.error), [derived]);
  const invalidCount = derived.length - validRows.length;
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0);

  // Distinct contributor keys among the valid rows (+ a friendly label).
  const memberKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of validRows) {
      const key = r.email ? r.email.toLowerCase() : ALL_KEY;
      if (!map.has(key)) map.set(key, r.email || "All rows");
    }
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [validRows]);

  // Seed a sensible default choice for any newly-seen contributor key.
  useEffect(() => {
    setMemberChoices((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const { key, label } of memberKeys) {
        if (next[key]) continue;
        changed = true;
        const existing = members.find(
          (m) => key !== ALL_KEY && m.email?.toLowerCase() === key,
        );
        next[key] = existing
          ? { mode: "existing", memberId: existing.id }
          : {
              mode: "new",
              newName: key === ALL_KEY ? "Imported" : humanizeEmail(label),
            };
      }
      return changed ? next : prev;
    });
  }, [memberKeys, members]);

  const newCategories = useMemo(() => {
    const have = new Set(existingCategories.map((c) => c.toLowerCase()));
    const needed = new Set(validRows.map((r) => r.category));
    return [...needed].filter((c) => !have.has(c.toLowerCase()));
  }, [validRows, existingCategories]);

  async function handleImport() {
    if (validRows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }
    const rows = validRows.map((r) => ({
      // biome-ignore lint/style/noNonNullAssertion: validRows have a parsed date
      date: r.date!,
      amount: r.amount,
      description: r.description,
      notes: r.method,
      categoryName: r.category,
      memberEmail: r.email ? r.email.toLowerCase() : ALL_KEY,
    }));
    const usedKeys = new Set(rows.map((r) => r.memberEmail));
    const memberResolutions = [...usedKeys].map((key) => {
      const choice = memberChoices[key];
      if (choice?.mode === "existing") {
        return { email: key, memberId: choice.memberId };
      }
      return { email: key, newName: choice?.newName?.trim() || "Imported" };
    });

    setImporting(true);
    try {
      const res = await withProgress(() =>
        importExpenses({ rows, memberResolutions }),
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      toast.success(`Imported ${res.imported} expense(s).`);
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  // --- Results view ---------------------------------------------------------
  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Import complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            <li>
              <strong className="tabular-nums">{result.imported}</strong>{" "}
              imported
            </li>
            <li className="text-muted-foreground">
              <span className="tabular-nums">{result.duplicates}</span> skipped
              as duplicates
            </li>
            {result.overLimit > 0 && (
              <li className="text-muted-foreground">
                <span className="tabular-nums">{result.overLimit}</span> skipped
                (household expense limit reached)
              </li>
            )}
            {result.failed.length > 0 && (
              <li className="text-destructive">
                <span className="tabular-nums">{result.failed.length}</span>{" "}
                failed
              </li>
            )}
          </ul>
          {result.failed.length > 0 && (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm">
              {result.failed.slice(0, 10).map((f) => (
                <div key={f.description} className="text-muted-foreground">
                  {f.description}: {f.reason}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button nativeButton={false} render={<Link href="/expenses" />}>
              View expenses
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setParsed(null);
                setFileName(null);
              }}
            >
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Upload view ----------------------------------------------------------
  if (!parsed) {
    return (
      <Card>
        <CardContent className="pt-6">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone with an explicit button fallback */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-border border-dashed py-12 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Upload className="h-8 w-8" />
            </div>
            <p className="font-medium">Drop a CSV file here</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">
              Columns are detected automatically. You can review and adjust the
              mapping before importing.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              type="button"
              className="mt-5"
              onClick={() => fileInput.current?.click()}
            >
              Choose CSV file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Mapping + preview view ----------------------------------------------
  const previewRows = derived.slice(0, 50);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <FileText className="h-4 w-4" /> {fileName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Match each field to a column from your file.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((role) => (
              <div key={role} className="space-y-2">
                <Label htmlFor={`map-${role}`}>{ROLE_LABELS[role]}</Label>
                <select
                  id={`map-${role}`}
                  className={selectClass()}
                  value={mapping[role]}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [role]: Number(e.target.value),
                    }))
                  }
                >
                  <option value={-1}>
                    {role === "email" || role === "method"
                      ? "— None —"
                      : "— Select column —"}
                  </option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Contributors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Each contributor in the file maps to a household member.
          </p>
          {memberKeys.map(({ key, label }) => {
            const choice = memberChoices[key];
            return (
              <div
                key={key}
                className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1.5fr]"
              >
                <span className="truncate text-sm" title={label}>
                  {label}
                </span>
                <div className="flex gap-2">
                  <select
                    className={selectClass()}
                    value={
                      choice?.mode === "existing" ? choice.memberId : "__new__"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setMemberChoices((prev) => ({
                        ...prev,
                        [key]:
                          v === "__new__"
                            ? {
                                mode: "new",
                                newName:
                                  key === ALL_KEY
                                    ? "Imported"
                                    : humanizeEmail(label),
                              }
                            : { mode: "existing", memberId: v },
                      }));
                    }}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    <option value="__new__">➕ Create new member…</option>
                  </select>
                  {choice?.mode === "new" && (
                    <Input
                      aria-label={`New member name for ${label}`}
                      value={choice.newName}
                      onChange={(e) =>
                        setMemberChoices((prev) => ({
                          ...prev,
                          [key]: { mode: "new", newName: e.target.value },
                        }))
                      }
                      placeholder="Member name"
                      className="h-11"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <strong className="tabular-nums">{validRows.length}</strong> ready
            </span>
            {invalidCount > 0 && (
              <span className="text-destructive">
                <span className="tabular-nums">{invalidCount}</span> skipped
                (invalid)
              </span>
            )}
            <span className="text-muted-foreground">
              total{" "}
              <span className="tabular-nums">
                {numberFmt.format(totalAmount)}
              </span>
            </span>
            {newCategories.length > 0 && (
              <span className="text-muted-foreground">
                new categories: {newCategories.join(", ")}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2 text-left font-medium">Date</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                  <th className="p-2 text-left font-medium">Description</th>
                  <th className="p-2 text-left font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="whitespace-nowrap p-2 text-muted-foreground tabular-nums">
                      {r.date ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {numberFmt.format(r.amount || 0)}
                    </td>
                    <td
                      className="max-w-[16rem] truncate p-2"
                      title={r.description}
                    >
                      {r.description || "—"}
                    </td>
                    <td className="p-2">
                      {r.error ? (
                        <span className="flex items-center gap-1 text-destructive text-xs">
                          <AlertTriangle className="h-3 w-3" /> {r.error}
                        </span>
                      ) : (
                        r.category
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {derived.length > previewRows.length && (
            <p className="text-muted-foreground text-xs">
              Showing first {previewRows.length} of {derived.length} rows.
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
            >
              {importing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              {importing
                ? "Importing…"
                : `Import ${validRows.length} expense${validRows.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setParsed(null);
                setFileName(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
