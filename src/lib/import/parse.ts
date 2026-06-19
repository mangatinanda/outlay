/**
 * Domain helpers for the CSV import feature: date normalization, keyword-based
 * categorization, column detection, and member-name derivation. All pure and
 * unit-tested so the UI and the server action share one source of truth.
 */

/** The five roles an import maps CSV columns onto. */
export type ColumnRole = "amount" | "date" | "description" | "method" | "email";

/**
 * Convert "DD/MM/YYYY" (also "D/M/YYYY", optionally with a trailing time) to an
 * ISO "YYYY-MM-DD" calendar date. Returns null if it is not a real date — the
 * expenses.date column is compared lexicographically and parsed with parseISO,
 * so only valid YYYY-MM-DD may reach it.
 */
export function parseDmyToIso(input: string): string | null {
  // Anchor the year: it must be followed by whitespace (a trailing time) or
  // end-of-string, so "12/05/20249" or "1/2/2024junk" are rejected rather than
  // silently truncated to a plausible-but-wrong date.
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through Date to reject impossible days like 31/02.
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Keyword → category rules. The FIRST bucket with a matching keyword wins, so
 * stronger / more specific signals come first (e.g. "tractor" → Farming beats
 * "petrol" → Transportation for "Tractor petrol"). Names reuse the app's
 * default categories where possible; only "Farming" is new.
 */
const RULES: ReadonlyArray<{ category: string; keywords: string[] }> = [
  {
    category: "Farming",
    keywords: [
      "tractor",
      "fertilizer",
      "groundnut",
      "goats",
      "palm",
      "farming",
      "solar panel",
      "seeds",
      "crop",
      "manure",
      "pesticide",
      "harvest",
    ],
  },
  {
    category: "Healthcare",
    keywords: [
      "medicine",
      "hospital",
      "surgery",
      "tablet",
      "bp ",
      "piles",
      "doctor",
      "clinic",
      "pharmacy",
      "health",
    ],
  },
  {
    category: "Transportation",
    keywords: [
      "bus",
      "bike",
      "ather",
      "scooter",
      "petrol",
      "diesel",
      "fuel",
      "cab",
      "train",
      "flight",
      "transport",
    ],
  },
  {
    category: "Utilities",
    keywords: [
      "power bill",
      "motor power",
      "electricity",
      "current bill",
      "recharge",
      "wifi",
      "internet",
      "broadband",
      "gas bill",
      "water bill",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "washing machine",
      "emi",
      "paint",
      "chair",
      "shampoo",
      "shopping",
      "plastic",
      "furniture",
      "appliance",
      "clothes",
    ],
  },
];

/** Bucket a free-text purpose into a category name (defaults to "Other"). */
export function categorize(text: string): string {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.category;
  }
  return "Other";
}

/** Icon/color presets for categories the import may need to create. Defaults
 *  to a neutral receipt for any name not listed (see category-icon.tsx). */
export const CATEGORY_PRESETS: Record<string, { icon: string; color: string }> =
  {
    Farming: { icon: "sprout", color: "#16a34a" },
    Healthcare: { icon: "heart-pulse", color: "#ef4444" },
    Utilities: { icon: "zap", color: "#eab308" },
    Transportation: { icon: "car", color: "#8b5cf6" },
    Shopping: { icon: "shopping-bag", color: "#06b6d4" },
    Other: { icon: "more-horizontal", color: "#6b7280" },
  };

export function categoryPreset(name: string): { icon: string; color: string } {
  return CATEGORY_PRESETS[name] ?? { icon: "receipt", color: "#6366f1" };
}

/** Best-effort match of CSV headers to roles by name. -1 means "not found". */
export function detectColumns(headers: string[]): Record<ColumnRole, number> {
  const find = (...needles: string[]) =>
    headers.findIndex((h) => {
      const x = h.toLowerCase();
      return needles.some((n) => x.includes(n));
    });
  return {
    amount: find("amount", "cost", "price", "value"),
    date: find("when", "date", "spent on"),
    description: find("purpose", "description", "detail", "what", "item"),
    method: find("how", "method", "payment", "mode"),
    email: find("email", "e-mail", "who", "member", "paid by"),
  };
}

/** Derive a friendly default display name from an email's local part. */
export function humanizeEmail(email: string): string {
  const local = (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").trim();
  if (!local) return email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
