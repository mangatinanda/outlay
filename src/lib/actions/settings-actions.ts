"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";
import { toMinorUnits } from "@/lib/money";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import {
  currencySchema,
  expenseNotifyThresholdSchema,
} from "@/lib/validators/settings-schema";
import { safeAction } from "./safe-action";

export const updateHouseholdCurrency = safeAction(
  "updateHouseholdCurrency",
  async (currency: string) => {
    const parsed = currencySchema.safeParse({ currency });
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    await db
      .update(households)
      .set({ currency: parsed.data.currency })
      .where(eq(households.id, household.id));

    // Reformat amounts everywhere the currency is shown.
    for (const path of [
      "/dashboard",
      "/expenses",
      "/members",
      "/categories",
      "/settings",
    ]) {
      revalidatePath(path);
    }
    return { success: true };
  },
);

export const updateExpenseNotifyThreshold = safeAction(
  "updateExpenseNotifyThreshold",
  async (formData: FormData) => {
    const parsed = expenseNotifyThresholdSchema.safeParse({
      amount: formData.get("amount"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const actor = await getCurrentActor();
    if (!actor) return { error: "Not authenticated" };
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    // Only a superadmin or an admin member of THIS household may change it.
    if (actor.kind === "user") {
      const [me] = await db
        .select({ role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            eq(householdMembers.userId, actor.userId),
          ),
        )
        .limit(1);
      if (me?.role !== "admin") {
        return { error: "Only an admin can change this" };
      }
    }

    const amount = parsed.data.amount;
    const minor = amount === "" || amount === 0 ? null : toMinorUnits(amount);
    await db
      .update(households)
      .set({ notifyExpenseOverMinor: minor })
      .where(eq(households.id, household.id));

    revalidatePath("/settings");
    return { success: true };
  },
);
