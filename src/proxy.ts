import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";

// Next.js 16 proxy (formerly middleware). Runs on the Node.js runtime.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Protect every route except /login, the offline fallback (must be reachable
  // for the service worker to precache it), Next internals, and any file with
  // an extension (sw.js, manifest.json, icons, favicon, etc.).
  matcher: ["/((?!login|~offline|_next|.*\\..*).*)"],
};
