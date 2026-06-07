interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  className?: string;
}

// Locale per currency for correct digit grouping — e.g. INR uses lakh/crore
// grouping (₹1,50,000) under "en-IN", not the US "₹150,000".
const CURRENCY_LOCALE: Record<string, string> = {
  INR: "en-IN",
};

export function formatCurrency(amount: number, currency = "INR") {
  const locale = CURRENCY_LOCALE[currency] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

export function CurrencyDisplay({ amount, currency = "INR", className }: CurrencyDisplayProps) {
  return <span className={className}>{formatCurrency(amount, currency)}</span>;
}
