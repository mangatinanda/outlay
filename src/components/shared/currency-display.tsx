interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  className?: string;
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function CurrencyDisplay({ amount, currency = "USD", className }: CurrencyDisplayProps) {
  return <span className={className}>{formatCurrency(amount, currency)}</span>;
}
