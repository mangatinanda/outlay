import { cookies } from "next/headers";
import { cache } from "react";
import { auth } from "@/auth";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";

export type Actor =
  | { kind: "superadmin" }
  | { kind: "user"; userId: string; email: string };

/** Resolve the current principal. Passcode cookie wins (a deliberate
 *  elevation), else the Google session, else null. cache()d for one
 *  resolution per request. */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return { kind: "superadmin" };

  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (userId && email) return { kind: "user", userId, email };

  return null;
});

/** Throwing variant for server actions that must have a principal. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new Error("Not authenticated");
  return actor;
}
