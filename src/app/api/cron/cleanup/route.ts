import { NextResponse } from "next/server";
import { cleanupAbandonedAccounts } from "@/lib/cleanup";
import { env } from "@/lib/env";

// Triggered by Vercel Cron (see vercel.json). Never statically optimized.
export const dynamic = "force-dynamic";

/**
 * Scheduled cleanup of abandoned accounts. Guarded by CRON_SECRET: Vercel Cron
 * automatically sends `Authorization: Bearer <CRON_SECRET>` when the env var is
 * set, so the endpoint can't be triggered by anyone else.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await cleanupAbandonedAccounts();
    console.log(
      `[cron/cleanup] removed ${result.deletedUsers} users, ${result.deletedHouseholds} households`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/cleanup] failed:", err);
    return NextResponse.json(
      { ok: false, error: "cleanup failed" },
      { status: 500 },
    );
  }
}
