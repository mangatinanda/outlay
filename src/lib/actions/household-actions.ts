"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCurrentActor } from "@/lib/auth/actor";
import { isMember } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { DEFAULT_CATEGORIES } from "@/lib/db/default-categories";
import {
  categories,
  expenses,
  householdMembers,
  households,
} from "@/lib/db/schema";
import {
  HOUSEHOLD_COOKIE,
  listHouseholds,
} from "@/lib/queries/household-queries";
import { householdSchema } from "@/lib/validators/household-schema";
import { currencySchema } from "@/lib/validators/settings-schema";
import { safeAction } from "./safe-action";

async function setCurrentHousehold(id: string) {
  (await cookies()).set(HOUSEHOLD_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

function revalidateAll() {
  for (const path of [
    "/dashboard",
    "/expenses",
    "/members",
    "/categories",
    "/settings",
    "/households",
  ]) {
    revalidatePath(path);
  }
}

export const switchHousehold = safeAction(
  "switchHousehold",
  async (id: string) => {
    const actor = await getCurrentActor();
    if (!actor) return { error: "Household not found" };
    if (actor.kind === "user" && !(await isMember(actor.userId, id))) {
      return { error: "Household not found" }; // don't leak existence
    }

    const exists = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, id))
      .limit(1);
    if (!exists[0]) return { error: "Household not found" };

    await setCurrentHousehold(id);
    revalidateAll();
    return { success: true };
  },
);

export const createHousehold = safeAction(
  "createHousehold",
  async (formData: FormData) => {
    const parsed = householdSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const currencyParsed = currencySchema.safeParse({
      currency: String(formData.get("currency") ?? "INR"),
    });
    const currency = currencyParsed.success
      ? currencyParsed.data.currency
      : "INR";

    const actor = await getCurrentActor();
    if (!actor) return { error: "Not authenticated" };

    const householdId = createId();
    // Seed a default member + the default categories so the household is usable
    // immediately — atomically, so a mid-failure can't leave it half-seeded.
    await db.batch([
      db
        .insert(households)
        .values({ id: householdId, name: parsed.data.name, currency }),
      db.insert(householdMembers).values({
        id: createId(),
        householdId,
        // A user creating a household becomes its admin auth-member; a
        // superadmin gets a label-only "Me" (they see it via god-mode).
        ...(actor.kind === "user"
          ? { userId: actor.userId, email: actor.email }
          : {}),
        name: "Me",
        role: "admin",
      }),
      db.insert(categories).values(
        DEFAULT_CATEGORIES.map((cat) => ({
          id: createId(),
          householdId,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          isDefault: true,
        })),
      ),
    ]);

    await setCurrentHousehold(householdId); // make the new household active
    revalidateAll();
    return { success: true };
  },
);

export const renameHousehold = safeAction(
  "renameHousehold",
  async (id: string, formData: FormData) => {
    const parsed = householdSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const actor = await getCurrentActor();
    if (
      !actor ||
      (actor.kind === "user" && !(await isMember(actor.userId, id)))
    ) {
      return { error: "Household not found" };
    }

    const updated = await db
      .update(households)
      .set({ name: parsed.data.name })
      .where(eq(households.id, id))
      .returning({ id: households.id });
    if (updated.length === 0) return { error: "Household not found" };

    revalidateAll();
    return { success: true };
  },
);

export const deleteHousehold = safeAction(
  "deleteHousehold",
  async (id: string) => {
    const all = await listHouseholds();
    if (!all.some((h) => h.id === id)) {
      return { error: "Household not found" };
    }
    if (all.length <= 1) {
      return { error: "You can't delete your only household." };
    }

    // Cascade-delete children in FK order, then the household — atomically.
    await db.batch([
      db.delete(expenses).where(eq(expenses.householdId, id)),
      db.delete(categories).where(eq(categories.householdId, id)),
      db.delete(householdMembers).where(eq(householdMembers.householdId, id)),
      db.delete(households).where(eq(households.id, id)),
    ]);

    // If the deleted household was active, switch to another remaining one.
    const current = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
    if (current === id) {
      const next = all.find((h) => h.id !== id);
      if (next) await setCurrentHousehold(next.id);
    }

    revalidateAll();
    return { success: true };
  },
);
