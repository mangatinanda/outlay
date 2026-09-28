"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateExpenseNotifyThreshold } from "@/lib/actions/settings-actions";

export function ExpenseNotifyThreshold({
  current,
}: {
  current: number | null; // major units, null = off
}) {
  const [saving, setSaving] = useState(false);
  // Controlled on purpose: React 19 resets a <form action>'s uncontrolled
  // fields once the action settles, which wiped what was typed on a rejected
  // save (e.g. a non-admin). State survives the reset.
  const [value, setValue] = useState(current === null ? "" : String(current));

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      const result = await updateExpenseNotifyThreshold(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Notification threshold saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-2">
      <Input
        type="number"
        name="amount"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Off"
        aria-label="Notify members about expenses over this amount"
        className="h-11 max-w-40 rounded-xl"
      />
      <Button
        type="submit"
        variant="outline"
        disabled={saving}
        className="h-11 rounded-xl"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
