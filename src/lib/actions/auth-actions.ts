"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import {
  constantTimeEqual,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/gate";
import { safeAction } from "./safe-action";

export type PasscodeState = { error: string } | null;

// Constant delay on every failed attempt: damps online brute-forcing of the
// shared passcode without needing a shared rate-limit store (serverless-safe).
const FAILED_ATTEMPT_DELAY_MS = 1000;

// safeAction rethrows the redirect() control-flow error, so a successful
// unlock still navigates; only real failures become { error }.
export const verifyPasscode = safeAction(
  "verifyPasscode",
  async (_prev: PasscodeState, formData: FormData): Promise<PasscodeState> => {
    const passcode = String(formData.get("passcode") ?? "");
    const expected = process.env.HOUSEHOLD_PASSCODE;

    if (!expected) {
      return { error: "Server is missing HOUSEHOLD_PASSCODE." };
    }
    if (!constantTimeEqual(passcode, expected)) {
      console.error("[auth] failed passcode attempt");
      await new Promise((resolve) =>
        setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS),
      );
      return { error: "Incorrect passcode." };
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await signSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS, // matches the token's own expiry
    });

    redirect("/dashboard");
  },
);

/**
 * Sign out of both auth paths: clear the passcode cookie and any Google
 * session. Not wrapped in safeAction: it's used as a bare <form action>,
 * which requires Promise<void> — and its only outcome is the redirect.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  await signOut({ redirectTo: "/login" });
}
