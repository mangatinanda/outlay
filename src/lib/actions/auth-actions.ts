"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, signSession, constantTimeEqual } from "@/lib/gate";

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
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect("/dashboard");
}
