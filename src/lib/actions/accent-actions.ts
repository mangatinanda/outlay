"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/actor";
import { isMember } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { accentSchema } from "@/lib/validators/accent-schema";
import { safeAction } from "./safe-action";

/**
 * Set a household's accent color. Mirrors the renameHousehold guard pattern:
 * a user may only change accent on a household they are a member of; a
 * superadmin may change any household. Returns the generic "Household not
 * found" on denial — never leaks existence.
 */
export const updateHouseholdAccent = safeAction(
  "updateHouseholdAccent",
  async (householdId: string, accent: string | null) => {
    const parsed = accentSchema.safeParse({ accent });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const actor = await getCurrentActor();
    if (
      !actor ||
      (actor.kind === "user" && !(await isMember(actor.userId, householdId)))
    ) {
      return { error: "Household not found" };
    }

    const updated = await db
      .update(households)
      .set({ accent: parsed.data.accent })
      .where(eq(households.id, householdId))
      .returning({ id: households.id });
    if (updated.length === 0) return { error: "Household not found" };

    revalidatePath("/", "layout"); // accent feeds the (app) layout shell
    return { success: true };
  },
);
