/**
 * Curated per-household accent palette. Free-form color pickers produce ugly
 * results — instead, each household picks one of these six pre-tested pairs.
 * Stored as the KEY in households.accent (null = Fresh Ledger default).
 *
 * Each pair has a primary color (in OKLCH for perceptual uniformity) and a
 * tested foreground color with ≥4.5:1 contrast for AA compliance. Both light
 * and dark mode use the same pair — picking is per-household, not per-mode.
 */

export interface AccentPair {
  /** Display name for the picker. */
  label: string;
  /** Value injected as --primary. */
  primary: string;
  /** Value injected as --primary-foreground. */
  primaryForeground: string;
}

export const ACCENTS = {
  indigo: {
    label: "Indigo",
    primary: "oklch(0.55 0.18 269)",
    primaryForeground: "oklch(0.985 0 0)",
  },
  saffron: {
    label: "Saffron",
    primary: "oklch(0.74 0.17 60)",
    primaryForeground: "oklch(0.205 0 0)",
  },
  forest: {
    label: "Forest",
    primary: "oklch(0.55 0.13 155)",
    primaryForeground: "oklch(0.985 0 0)",
  },
  rose: {
    label: "Rose",
    primary: "oklch(0.62 0.19 15)",
    primaryForeground: "oklch(0.985 0 0)",
  },
  sand: {
    label: "Sand",
    primary: "oklch(0.7 0.07 75)",
    primaryForeground: "oklch(0.205 0 0)",
  },
  slate: {
    label: "Slate",
    primary: "oklch(0.5 0.04 250)",
    primaryForeground: "oklch(0.985 0 0)",
  },
} as const satisfies Record<string, AccentPair>;

export type AccentKey = keyof typeof ACCENTS;

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === "string" && value in ACCENTS;
}

/** Resolve the accent stored on a household to a CSS-var pair, or null if
 *  no accent is set (let the Fresh Ledger default apply). */
export function resolveAccent(
  value: string | null | undefined,
): AccentPair | null {
  if (!value || !isAccentKey(value)) return null;
  return ACCENTS[value];
}
