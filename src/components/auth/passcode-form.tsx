"use client";

import { useActionState } from "react";
import { verifyPasscode, type PasscodeState } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasscodeForm() {
  const [state, formAction, pending] = useActionState<PasscodeState, FormData>(
    verifyPasscode,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Input
        type="password"
        name="passcode"
        placeholder="Enter household passcode"
        autoFocus
        required
        className="h-12 text-base"
        aria-invalid={state?.error ? true : undefined}
      />
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="w-full h-12 text-base" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
