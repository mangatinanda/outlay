"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateHouseholdCurrency } from "@/lib/actions/settings-actions";
import { CURRENCIES } from "@/lib/constants";

export function CurrencySwitcher({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next); // optimistic
    startTransition(async () => {
      const result = await updateHouseholdCurrency(next);
      if (result?.error) {
        setValue(previous); // revert on failure
        toast.error(result.error);
      } else {
        toast.success("Currency updated");
      }
    });
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => handleChange(v as string)}
      disabled={pending}
    >
      <SelectTrigger className="w-56 rounded-xl">
        <SelectValue placeholder="Select currency" />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="text-muted-foreground">{c.symbol}</span> {c.name} (
            {c.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
