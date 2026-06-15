"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PasscodeState, verifyPasscode } from "@/lib/actions/auth-actions";

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
        className="h-12 rounded-xl text-base"
        aria-invalid={state?.error ? true : undefined}
      />
      {state?.error && (
        <p className="text-destructive text-sm">{state.error}</p>
      )}
      <Button
        type="submit"
        className="h-12 w-full rounded-xl text-base"
        disabled={pending}
      >
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
