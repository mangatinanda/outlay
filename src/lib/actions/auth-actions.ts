"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  constantTimeEqual,
} from "@/lib/gate";
import { signOut } from "@/auth";

export type PasscodeState = { error: string } | null;

export async function verifyPasscode(
  _prev: PasscodeState,
  formData: FormData,
): Promise<PasscodeState> {
  const passcode = String(formData.get("passcode") ?? "");
  const expected = process.env.HOUSEHOLD_PASSCODE;

  if (!expected) {
    return { error: "Server is missing HOUSEHOLD_PASSCODE." };
  }
  if (!constantTimeEqual(passcode, expected)) {
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
}

/** Sign out of both auth paths: clear the passcode cookie and any Google session. */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  await signOut({ redirectTo: "/login" });
}
