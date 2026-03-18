export const HOUSEHOLD_ID = "default"; // Will be dynamic once auth is wired up

export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "\u20ac", name: "Euro" },
  { code: "GBP", symbol: "\u00a3", name: "British Pound" },
  { code: "INR", symbol: "\u20b9", name: "Indian Rupee" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "JPY", symbol: "\u00a5", name: "Japanese Yen" },
] as const;

export const CATEGORY_ICONS = [
  "shopping-cart", "zap", "home", "car", "utensils", "film",
  "heart-pulse", "shopping-bag", "graduation-cap", "shield",
  "repeat", "more-horizontal", "plane", "baby", "dog",
  "dumbbell", "gift", "wrench", "wifi", "phone",
  "receipt", "piggy-bank", "briefcase", "music",
] as const;

export const CATEGORY_COLORS = [
  "#22c55e", "#eab308", "#3b82f6", "#8b5cf6", "#f97316",
  "#ec4899", "#ef4444", "#06b6d4", "#6366f1", "#14b8a6",
  "#a855f7", "#6b7280", "#f43f5e", "#84cc16", "#0ea5e9",
] as const;
