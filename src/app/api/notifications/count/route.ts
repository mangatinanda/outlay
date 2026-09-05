import { NextResponse } from "next/server";
import { getUnreadCount } from "@/lib/queries/notification-queries";

// Polled by the header bell (~60s, tab-visible only). A read this frequent is
// the one place a GET route beats a Server Action POST — documented exception
// to the "Server Actions for everything" convention.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ count: await getUnreadCount() });
}
