"use server";

import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { currencySchema } from "@/lib/validators/settings-schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateHouseholdCurrency(currency: string) {
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
  for (const path of ["/dashboard", "/expenses", "/members", "/categories", "/settings"]) {
    revalidatePath(path);
  }
  return { success: true };
}
