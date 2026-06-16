import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";

// Next.js 16 proxy (formerly middleware), Node.js runtime.
// Access is granted by EITHER a Google (Auth.js) session OR the shared passcode.
export const proxy = auth(async (req) => {
  if (req.auth) return NextResponse.next(); // signed in with Google

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next(); // passcode session

  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  // Protect every route except /login, the Auth.js API (OAuth round-trip must be
  // reachable), the offline fallback, Next internals, and any file with an extension.
  matcher: ["/((?!login|admin|api/auth|~offline|_next|.*\\..*).*)"],
};
