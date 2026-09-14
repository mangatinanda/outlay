"use client";

import {
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  countActiveFilters,
  type ExpenseFilters as Filters,
  filtersToSearchParams,
  parseExpenseFilters,
  SEARCH_MAX_LENGTH,
} from "@/lib/validators/expense-filter-schema";

interface Option {
  id: string;
  name: string;
}

const ANY = "__any__";
const day = (d: Date) => format(d, "yyyy-MM-dd");

/** Date-range shortcuts, newest-first in the order people reach for them. */
const DATE_PRESETS: Array<{ label: string; range: () => [string, string] }> = [
  {
    label: "This month",
    range: () => [day(startOfMonth(new Date())), day(new Date())],
  },
  {
    label: "Last month",
    range: () => {
      const prev = subMonths(new Date(), 1);
      const start = startOfMonth(prev);
      return [day(start), day(subDays(startOfMonth(new Date()), 1))];
    },
  },
  {
    label: "Last 30 days",
    range: () => [day(subDays(new Date(), 29)), day(new Date())],
  },
  {
    label: "This year",
    range: () => [day(startOfYear(new Date())), day(new Date())],
  },
];

function formatRange(from?: string, to?: string) {
  const short = (d: string) => format(parseISO(d), "d MMM yyyy");
  if (from && to) return `${short(from)} – ${short(to)}`;
  if (from) return `From ${short(from)}`;
  if (to) return `Until ${short(to)}`;
  return "";
}

export function ExpenseFilters({
  categories,
  members,
}: {
  categories: Option[];
  members: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The query string is a stable primitive; every derived value hangs off it,
  // which keeps the effects below from re-running on each render.
  const queryString = searchParams.toString();
  const filters = useMemo(
    () =>
      parseExpenseFilters(Object.fromEntries(new URLSearchParams(queryString))),
    [queryString],
  );
  const activeCount = countActiveFilters(filters);

  const [open, setOpen] = useState(false);
  // The search box is typed into freely and pushed to the URL on a pause, so
  // every keystroke doesn't refetch the list.
  const [search, setSearch] = useState(filters.q ?? "");
  // Draft state for the sheet: nothing applies until Apply is pressed.
  const [draft, setDraft] = useState<Filters>(filters);

  // Adopt filters that changed outside this component (back button, a chip
  // removal, a shared link). The URL is the source of truth.
  useEffect(() => {
    setSearch(filters.q ?? "");
  }, [filters.q]);

  const apply = useCallback(
    (next: Filters) => {
      const qs = filtersToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // Debounced search: one URL update per pause, not per keystroke.
  useEffect(() => {
    const current = filters.q ?? "";
    const trimmed = search.trim();
    if (trimmed === current) return;
    const id = setTimeout(() => {
      apply({ ...filters, q: trimmed || undefined });
    }, 300);
    return () => clearTimeout(id);
  }, [search, filters, apply]);

  function openSheet() {
    setDraft(filters);
    setOpen(true);
  }

  function clearAll() {
    setSearch("");
    apply({});
  }

  const categoryName = filters.category
    ? (categories.find((c) => c.id === filters.category)?.name ?? "Category")
    : null;
  const memberName = filters.member
    ? (members.find((m) => m.id === filters.member)?.name ?? "Member")
    : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search expenses"
            aria-label="Search expenses"
            className="min-h-11 pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={openSheet}
          className="min-h-11 shrink-0"
          aria-label={
            activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"
          }
        >
          <SlidersHorizontal className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Filters</span>
          {activeCount > 0 && (
            <Badge className="ml-2 tabular-nums">{activeCount}</Badge>
          )}
        </Button>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(filters.from || filters.to) && (
            <FilterChip
              label={formatRange(filters.from, filters.to)}
              onRemove={() =>
                apply({ ...filters, from: undefined, to: undefined })
              }
            />
          )}
          {categoryName && (
            <FilterChip
              label={categoryName}
              onRemove={() => apply({ ...filters, category: undefined })}
            />
          )}
          {memberName && (
            <FilterChip
              label={memberName}
              onRemove={() => apply({ ...filters, member: undefined })}
            />
          )}
          {filters.q && (
            <FilterChip
              label={`“${filters.q}”`}
              onRemove={() => {
                setSearch("");
                apply({ ...filters, q: undefined });
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="min-h-11 text-muted-foreground"
          >
            Clear all
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle className="font-display">Filters</SheetTitle>
            <SheetDescription className="sr-only">
              Narrow the expense list by date, category or who paid.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-4">
            <div className="space-y-2">
              <Label>Date range</Label>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 shrink-0 rounded-full"
                    onClick={() => {
                      const [from, to] = preset.range();
                      setDraft((d) => ({ ...d, from, to }));
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0 rounded-full"
                  onClick={() =>
                    setDraft((d) => ({ ...d, from: undefined, to: undefined }))
                  }
                >
                  All time
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="filter-from" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="filter-from"
                    type="date"
                    className="min-h-11"
                    value={draft.from ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        from: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="filter-to" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="filter-to"
                    type="date"
                    className="min-h-11"
                    value={draft.to ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        to: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-category">Category</Label>
              <Select
                value={draft.category ?? ANY}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    category: !v || v === ANY ? undefined : v,
                  }))
                }
              >
                <SelectTrigger id="filter-category" className="min-h-11">
                  <SelectValue placeholder="Any category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-member">Paid by</Label>
              <Select
                value={draft.member ?? ANY}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    member: !v || v === ANY ? undefined : v,
                  }))
                }
              >
                <SelectTrigger id="filter-member" className="min-h-11">
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Anyone</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => {
                  setDraft({});
                  setSearch("");
                  apply({});
                  setOpen(false);
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1"
                onClick={() => {
                  // Keep whatever is typed in the search box.
                  apply({ ...draft, q: search.trim() || undefined });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <Badge variant="secondary" className="gap-1 py-0 pr-0 pl-3">
      <span className="py-1">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex h-11 w-9 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

/**
 * Count + total of the rows currently shown. A client component because money
 * is formatted with the household's currency via the provider hook.
 */
export function FilterSummary({
  count,
  total,
}: {
  count: number;
  total: number;
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <p className="text-muted-foreground text-sm">
      <span className="font-medium text-foreground tabular-nums">{count}</span>{" "}
      {count === 1 ? "expense" : "expenses"} ·{" "}
      <span className="font-medium text-foreground tabular-nums">
        {formatCurrency(total)}
      </span>
    </p>
  );
}
