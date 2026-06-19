"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { categories, expenses, householdMembers } from "@/lib/db/schema";
import { categoryPreset } from "@/lib/import/parse";
import { LIMITS } from "@/lib/limits";
import { toMinorUnits } from "@/lib/money";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { importPayloadSchema } from "@/lib/validators/import-schema";
import { safeAction } from "./safe-action";

export interface ImportResult {
  imported: number;
  duplicates: number; // skipped: identical row already in this household
  overLimit: number; // skipped: would exceed the per-household expense cap
  failed: Array<{ description: string; reason: string }>;
}

/**
 * Bulk-import expenses into the active household from client-normalized rows.
 *
 * Resolves contributors (by mapping their email/key to an existing or new
 * member), creates any missing categories with sensible presets, skips rows
 * that already exist (idempotent re-runs), and honours the per-household
 * expense cap. Returns a per-row breakdown rather than failing the whole batch.
 */
export const importExpenses = safeAction(
  "importExpenses",
  async (
    payload: unknown,
  ): Promise<{ error: string } | ({ success: true } & ImportResult)> => {
    const parsed = importPayloadSchema.safeParse(payload);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { rows, memberResolutions } = parsed.data;

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };
    const hid = household.id;

    // Throttle bulk imports per household.
    const rl = await rateLimit(`import:${hid}`, {
      limit: RATE_LIMITS.importsPerHour,
      windowSec: 3600,
    });
    if (rl.limited) return { error: RATE_LIMITED_MESSAGE };

    // --- Read existing members/categories (NO writes here — creation is
    // deferred to the second pass so a no-op/duplicate/capped import never
    // leaves orphan member or category rows behind).
    const existingMembers = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, hid));
    const memberIds = new Set(existingMembers.map((m) => m.id));
    const existingByName = new Map<string, string>();
    const existingByEmail = new Map<string, string>();
    for (const m of existingMembers) {
      existingByName.set(m.name.toLowerCase(), m.id);
      if (m.email) existingByEmail.set(m.email.toLowerCase(), m.id);
    }

    const resolutionByEmail = new Map(
      memberResolutions.map((r) => [r.email.trim().toLowerCase(), r]),
    );
    // Validate resolutions up front (still no writes): a chosen member must
    // belong to this household; otherwise a new-member name is required.
    for (const r of memberResolutions) {
      if (r.memberId && !memberIds.has(r.memberId)) {
        return { error: "Selected member is not in this household" };
      }
      if (!r.memberId && !r.newName?.trim()) {
        return { error: "Each contributor must map to a member" };
      }
    }

    const existingCatByName = new Map(
      (
        await db
          .select()
          .from(categories)
          .where(eq(categories.householdId, hid))
      ).map((c) => [c.name.toLowerCase(), c.id]),
    );

    // --- Existing rows for dedupe + remaining cap headroom. The dedupe key
    // includes memberId so two members' identical-looking expenses (same
    // date/amount/description) are NOT collapsed into one.
    const existing = await db
      .select({
        date: expenses.date,
        amountMinor: expenses.amountMinor,
        description: expenses.description,
        memberId: expenses.memberId,
      })
      .from(expenses)
      .where(eq(expenses.householdId, hid));
    const seen = new Set(
      existing.map(
        (e) => `${e.date}|${e.amountMinor}|${e.description}|${e.memberId}`,
      ),
    );
    let remaining = Math.max(
      0,
      LIMITS.maxExpensesPerHousehold - existing.length,
    );

    // A stable token per contributor: an existing member's real id, or a
    // synthetic "new:<emailKey>" so distinct emails stay distinct members
    // (and identical re-imports resolve to the same token → same member).
    const tokenFor = (emailKey: string): string | null => {
      const r = resolutionByEmail.get(emailKey);
      if (!r) return null;
      if (r.memberId) return r.memberId;
      const reused =
        (emailKey ? existingByEmail.get(emailKey) : undefined) ??
        existingByName.get((r.newName ?? "").trim().toLowerCase());
      return reused ?? `new:${emailKey}`;
    };

    const result: ImportResult = {
      imported: 0,
      duplicates: 0,
      overLimit: 0,
      failed: [],
    };

    // --- Pass 1: classify rows (no writes). Only rows that will actually be
    // inserted reach `accepted`.
    const accepted: Array<{
      token: string;
      categoryName: string;
      amountMinor: number;
      description: string;
      date: string;
      notes: string | null;
    }> = [];
    for (const r of rows) {
      const emailKey = r.memberEmail.trim().toLowerCase();
      const token = tokenFor(emailKey);
      if (!token) {
        result.failed.push({
          description: r.description,
          reason: `No contributor mapping for "${r.memberEmail}"`,
        });
        continue;
      }
      const amountMinor = toMinorUnits(r.amount);
      const key = `${r.date}|${amountMinor}|${r.description}|${token}`;
      if (seen.has(key)) {
        result.duplicates++;
        continue;
      }
      if (remaining <= 0) {
        result.overLimit++;
        continue;
      }
      seen.add(key);
      remaining--;
      accepted.push({
        token,
        categoryName: r.categoryName,
        amountMinor,
        description: r.description,
        date: r.date,
        notes: r.notes?.trim() ? r.notes.trim() : null,
      });
    }

    // --- Pass 2: create ONLY the members/categories the accepted rows need.
    // New members are attribution-only (email: null): persisting a CSV-supplied
    // email here would make it sign-in-eligible via canSignIn's isKnownEmail.
    const tokenToMemberId = new Map<string, string>();
    for (const a of accepted) {
      if (tokenToMemberId.has(a.token)) continue;
      if (!a.token.startsWith("new:")) {
        tokenToMemberId.set(a.token, a.token); // existing member id
        continue;
      }
      const emailKey = a.token.slice("new:".length);
      const newName = (resolutionByEmail.get(emailKey)?.newName ?? "").trim();
      const id = createId();
      await db.insert(householdMembers).values({
        id,
        householdId: hid,
        name: newName || "Imported",
        email: null,
        role: "member",
      });
      tokenToMemberId.set(a.token, id);
    }

    const catNameToId = new Map(existingCatByName);
    for (const a of accepted) {
      if (catNameToId.has(a.categoryName.toLowerCase())) continue;
      const preset = categoryPreset(a.categoryName);
      const id = createId();
      await db.insert(categories).values({
        id,
        householdId: hid,
        name: a.categoryName,
        icon: preset.icon,
        color: preset.color,
      });
      catNameToId.set(a.categoryName.toLowerCase(), id);
    }

    const toInsert: (typeof expenses.$inferInsert)[] = accepted.map((a) => ({
      id: createId(),
      householdId: hid,
      // biome-ignore lint/style/noNonNullAssertion: token/category were just resolved above
      categoryId: catNameToId.get(a.categoryName.toLowerCase())!,
      // biome-ignore lint/style/noNonNullAssertion: every accepted token is in the map
      memberId: tokenToMemberId.get(a.token)!,
      amountMinor: a.amountMinor,
      description: a.description,
      date: a.date,
      notes: a.notes,
    }));
    result.imported = toInsert.length;

    // Insert in chunks so a large import stays within statement limits.
    for (let i = 0; i < toInsert.length; i += 100) {
      await db.insert(expenses).values(toInsert.slice(i, i + 100));
    }

    revalidatePath("/dashboard");
    revalidatePath("/expenses");
    revalidatePath("/categories");
    revalidatePath("/members");
    return { success: true, ...result };
  },
);
