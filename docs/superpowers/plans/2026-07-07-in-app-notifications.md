# In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user cross-household in-app notifications: invite Accept/Decline in-app, settlement/large-expense events, header bell + dropdown + `/notifications` page, 60s unread-count poll.

**Architecture:** A denormalized `notifications` table fanned out on write by a best-effort `notify()` helper (same posture as `logActivity`) called from existing Server Actions. Reads are actor-scoped queries; invite state is resolved live from `household_members` so notifications never go stale. One GET route for the count poll; everything else is Server Actions/Components.

**Tech Stack:** Next.js 16 App Router, Drizzle + libSQL, Zod v4 (`zod/v4` subpath), Vitest (in-memory libSQL + real migrations), shadcn/ui (Base UI), date-fns, sonner.

**Spec:** `docs/superpowers/specs/2026-07-07-in-app-notifications-design.md`

## Global Constraints

- Package manager is **pnpm**. Test: `pnpm test` (Vitest). Lint/format: Biome via the PostToolUse hook — do not hand-format.
- Money is integer **minor units** (scale 100, `src/lib/money.ts` `toMinorUnits`). Forms take major units.
- All mutations: `safeAction("name", …)` wrapper → `{ error: string }` failures, `{ success: true }` wins; scope by household/actor; `revalidatePath()` after writes.
- `notify()` is **BEST-EFFORT**: it must never throw into its caller. Emitters run after the mutation succeeds, before `revalidatePath()`.
- Superadmin (`actor.kind === "superadmin"`) has **no `userId`**: never receives notifications, never sees the bell; queries return 0/empty.
- UI rules (`.claude/rules/ui.md`): semantic tokens only (no hex/rgb), `rounded-2xl`+`shadow-card` surfaces, 44px touch targets, `cn` from `@/lib/utils`, motion no-ops under reduced motion, no edits to `src/components/ui/*`.
- Notification `type` values (exact strings): `invite.received`, `invite.accepted`, `invite.declined`, `settlement.recorded`, `expense.large`.
- Retention: keep the newest **100** notifications per user, pruned on write.
- Commit after every task with a conventional-commit message ending in the Claude co-author trailer.

---

### Task 1: Schema — `notifications` table + `households.notify_expense_over_minor`

**Files:**
- Modify: `src/lib/db/schema.ts` (after the `householdMembers` table, and inside `households`)
- Create (generated): `drizzle/0007_*.sql` via `pnpm db:generate`

**Interfaces:**
- Produces: `notifications` Drizzle table object, `households.notifyExpenseOverMinor` column, types `Notification`, `NewNotification`.

- [ ] **Step 1: Add the column to `households`**

In `src/lib/db/schema.ts`, add to the `households` table after `accent`:

```ts
  // Notify members about expenses ≥ this many minor units (null/0 = off).
  notifyExpenseOverMinor: integer("notify_expense_over_minor"),
```

- [ ] **Step 2: Add the `notifications` table**

Add after the `householdMembers` table definition:

```ts
// Per-user, cross-household notification feed. Denormalized like `activity`:
// no FKs except user_id — the payload snapshots everything needed to render
// (householdName, labels, amountMinor+currency) so rows outlive their sources.
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: [
        "invite.received",
        "invite.accepted",
        "invite.declined",
        "settlement.recorded",
        "expense.large",
      ],
    }).notNull(),
    householdId: text("household_id"), // context only — deliberately no FK
    payload: text("payload").notNull(), // JSON snapshot, type-specific
    readAt: integer("read_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_user_unread_idx").on(table.userId, table.readAt),
  ],
);
```

And at the bottom with the other type exports:

```ts
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0007_<name>.sql` containing `CREATE TABLE notifications` and `ALTER TABLE households ADD notify_expense_over_minor`.

- [ ] **Step 4: Verify existing tests still pass (they run real migrations)**

Run: `pnpm test`
Expected: all existing suites PASS (the in-memory migrator applies 0007 cleanly).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(db): notifications table + household expense-notify threshold"
```

---

### Task 2: `notify()` helper

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `src/lib/notifications.test.ts`

**Interfaces:**
- Produces:
  - `type NotificationType = "invite.received" | "invite.accepted" | "invite.declined" | "settlement.recorded" | "expense.large"`
  - Payload types: `InviteReceivedPayload { memberId: string; householdName: string; invitedBy: string }`, `InviteAcceptedPayload { accepterName: string; householdName: string }`, `InviteDeclinedPayload { invitedEmail: string; householdName: string }`, `SettlementRecordedPayload { amountMinor: number; currency: string; fromName: string; toName: string; householdName: string }`, `ExpenseLargePayload { amountMinor: number; currency: string; description: string; actorLabel: string; householdName: string }`
  - `NOTIFICATIONS_KEEP = 100`
  - `notify(input: { userIds: string[]; type: NotificationType; householdId?: string; payload: Record<string, unknown> }): Promise<void>` — dedupes userIds, never throws.

- [ ] **Step 1: Write the failing tests**

`src/lib/notifications.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = ":memory:";
process.env.AUTH_SECRET ??= "test-secret";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { NOTIFICATIONS_KEEP, notify } from "@/lib/notifications";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "A", email: "a@x.com" });
  await db.insert(users).values({ id: "u2", name: "B", email: "b@x.com" });
});

describe("notify", () => {
  it("inserts one row per (deduped) user", async () => {
    await notify({
      userIds: ["u1", "u2", "u1"],
      type: "invite.received",
      householdId: "h1",
      payload: { memberId: "m1", householdName: "Home", invitedBy: "Admin" },
    });
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(["u1", "u2"]));
    expect(JSON.parse(rows[0].payload).householdName).toBe("Home");
    expect(rows[0].readAt).toBeNull();
  });

  it("is a no-op for an empty recipient list", async () => {
    const before = (await db.select().from(notifications)).length;
    await notify({ userIds: [], type: "invite.accepted", payload: {} });
    expect((await db.select().from(notifications)).length).toBe(before);
  });

  it("never throws (unserializable payload is swallowed)", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      notify({ userIds: ["u1"], type: "expense.large", payload: circular }),
    ).resolves.toBeUndefined();
  });

  it("prunes to the newest NOTIFICATIONS_KEEP per user", async () => {
    await db.delete(notifications);
    // 5 over the cap, with distinct timestamps so ordering is deterministic.
    for (let i = 0; i < NOTIFICATIONS_KEEP + 5; i++) {
      await db.insert(notifications).values({
        id: `n${i.toString().padStart(3, "0")}`,
        userId: "u1",
        type: "expense.large",
        payload: "{}",
        createdAt: new Date(1700000000000 + i * 1000),
      });
    }
    await notify({
      userIds: ["u1"],
      type: "expense.large",
      payload: { i: "newest" },
    });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(rows).toHaveLength(NOTIFICATIONS_KEEP);
    // The oldest seeded rows are gone; the freshly notified row survives.
    expect(rows.some((r) => r.id === "n000")).toBe(false);
    expect(rows.some((r) => r.payload.includes("newest"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/notifications.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications'` (or equivalent).

- [ ] **Step 3: Implement `src/lib/notifications.ts`**

```ts
import { createId } from "@paralleldrive/cuid2";
import { eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export type NotificationType =
  | "invite.received"
  | "invite.accepted"
  | "invite.declined"
  | "settlement.recorded"
  | "expense.large";

export interface InviteReceivedPayload {
  memberId: string;
  householdName: string;
  invitedBy: string;
}
export interface InviteAcceptedPayload {
  accepterName: string;
  householdName: string;
}
export interface InviteDeclinedPayload {
  invitedEmail: string;
  householdName: string;
}
export interface SettlementRecordedPayload {
  amountMinor: number;
  currency: string;
  fromName: string;
  toName: string;
  householdName: string;
}
export interface ExpenseLargePayload {
  amountMinor: number;
  currency: string;
  description: string;
  actorLabel: string;
  householdName: string;
}

/** Keep only this many notifications per user (pruned on write). */
export const NOTIFICATIONS_KEEP = 100;

/**
 * Fan a notification out to users. BEST-EFFORT: any failure is logged and
 * swallowed so it never breaks the caller's mutation (same posture as
 * logActivity). Call AFTER the mutation succeeds, before revalidatePath().
 * This is the single emission point — v2 Web Push dispatch slots in here.
 */
export async function notify(input: {
  userIds: string[];
  type: NotificationType;
  householdId?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return;
    const payload = JSON.stringify(input.payload);
    await db.insert(notifications).values(
      userIds.map((userId) => ({
        id: createId(),
        userId,
        type: input.type,
        householdId: input.householdId ?? null,
        payload,
      })),
    );
    for (const userId of userIds) {
      const keep = db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(
          sql`${notifications.createdAt} DESC`,
          sql`${notifications.id} DESC`,
        )
        .limit(NOTIFICATIONS_KEEP);
      await db
        .delete(notifications)
        .where(
          sql`${notifications.userId} = ${userId} AND ${notInArray(notifications.id, keep)}`,
        );
    }
  } catch (err) {
    console.error("[notify] failed (ignored):", err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/notifications.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "feat(notifications): best-effort notify() fan-out helper with prune-on-write"
```

---

### Task 3: Emitter — `invite.received` from `inviteToHousehold`

**Files:**
- Modify: `src/lib/activity.ts` (export `actorLabelFor`)
- Modify: `src/lib/actions/invite-actions.ts`
- Test: extend `src/lib/actions/invite-actions.test.ts`

**Interfaces:**
- Consumes: `notify`, `InviteReceivedPayload` (Task 2).
- Produces: `actorLabelFor(householdId: string): Promise<{ actorUserId: string | null; actorLabel: string }>` exported from `@/lib/activity` (previously private; unchanged behavior).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/actions/invite-actions.test.ts` (inside the existing file — the mocks/seed at the top already exist):

```ts
import { notifications } from "@/lib/db/schema"; // merge into the existing schema import

describe("inviteToHousehold → invite.received notification", () => {
  it("notifies an invited email that has an account", async () => {
    await db
      .insert(users)
      .values({ id: "u3", name: "Cara", email: "cara@x.com" });
    const result = await inviteToHousehold(form("cara@x.com"));
    expect(result).toEqual({ success: true });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u3"));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("invite.received");
    expect(rows[0].householdId).toBe("h1");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.householdName).toBe("Home");
    expect(payload.invitedBy).toBe("Admin");
    // memberId points at the pending invite row
    const [invite] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, payload.memberId));
    expect(invite.email).toBe("cara@x.com");
    expect(invite.userId).toBeNull();
  });

  it("creates no notification for an unknown email", async () => {
    const before = (await db.select().from(notifications)).length;
    await inviteToHousehold(form("nobody@x.com"));
    expect((await db.select().from(notifications)).length).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/actions/invite-actions.test.ts`
Expected: the two new tests FAIL (0 notification rows); the four existing tests still PASS.

- [ ] **Step 3: Export `actorLabelFor` from `src/lib/activity.ts`**

Change line 25 `async function actorLabelFor(` to:

```ts
export async function actorLabelFor(
```

(Only the `export` keyword is added; the doc comment above it stays.)

- [ ] **Step 4: Emit from `inviteToHousehold`**

In `src/lib/actions/invite-actions.ts`, add imports:

```ts
import { users } from "@/lib/db/schema"; // merge into the existing schema import
import { actorLabelFor } from "@/lib/activity"; // merge with the logActivity import
import { type InviteReceivedPayload, notify } from "@/lib/notifications";
```

Capture the new row id — change the insert to keep the id:

```ts
    const memberId = createId();
    await db.insert(householdMembers).values({
      id: memberId,
      householdId: household.id,
      email,
      name: email.split("@")[0],
      role: "member",
    });

    // In-app notification if the invited email already has an account
    // (brand-new emails have nobody to notify; they claim at first sign-in).
    const [invitee] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (invitee) {
      const { actorLabel } = await actorLabelFor(household.id);
      const payload: InviteReceivedPayload = {
        memberId,
        householdName: household.name,
        invitedBy: actorLabel,
      };
      await notify({
        userIds: [invitee.id],
        type: "invite.received",
        householdId: household.id,
        payload: { ...payload },
      });
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/actions/invite-actions.test.ts && pnpm test src/lib/activity-instrumentation.test.ts`
Expected: all PASS (the activity test guards the `actorLabelFor` refactor).

- [ ] **Step 6: Commit**

```bash
git add src/lib/activity.ts src/lib/actions/invite-actions.ts src/lib/actions/invite-actions.test.ts
git commit -m "feat(notifications): emit invite.received to existing users on invite"
```

---

### Task 4: Read queries — `getUnreadCount` + `listNotifications`

**Files:**
- Create: `src/lib/queries/notification-queries.ts`
- Test: `src/lib/queries/notification-queries.test.ts`

**Interfaces:**
- Consumes: `notifications` table (Task 1), payload types (Task 2).
- Produces:
  - `getUnreadCount(): Promise<number>` — 0 for superadmin/signed-out.
  - `type InviteState = "pending" | "accepted" | "gone"`
  - `interface NotificationItemData { id: string; type: NotificationType; householdId: string | null; payload: Record<string, unknown>; readAt: number | null; createdAt: number; inviteState?: InviteState }`
  - `listNotifications(limit?: number): Promise<NotificationItemData[]>` — newest first, times as unix-ms, payload parsed, invite state resolved live.

- [ ] **Step 1: Write the failing tests**

`src/lib/queries/notification-queries.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: null as unknown };
});
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import {
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import {
  getUnreadCount,
  listNotifications,
} from "@/lib/queries/notification-queries";

const ME = { kind: "user", userId: "u1", email: "me@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Me", email: "me@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  // Pending invite row (claimable) + an already-claimed row.
  await db.insert(householdMembers).values({
    id: "m-pending",
    householdId: "h1",
    email: "me@x.com",
    name: "me",
    role: "member",
  });
  await db.insert(householdMembers).values({
    id: "m-claimed",
    householdId: "h1",
    userId: "u1",
    email: "other@x.com",
    name: "other",
    role: "member",
  });
});

beforeEach(async () => {
  actorState.actor = ME;
  await db.delete(notifications);
});

function seed(id: string, over: Partial<typeof notifications.$inferInsert>) {
  return db.insert(notifications).values({
    id,
    userId: "u1",
    type: "expense.large",
    payload: "{}",
    createdAt: new Date(1700000000000),
    ...over,
  });
}

describe("getUnreadCount", () => {
  it("counts only unread rows for the current user", async () => {
    await seed("n1", {});
    await seed("n2", { readAt: new Date() });
    expect(await getUnreadCount()).toBe(1);
  });

  it("returns 0 for superadmin and signed-out", async () => {
    await seed("n1", {});
    actorState.actor = { kind: "superadmin" };
    expect(await getUnreadCount()).toBe(0);
    actorState.actor = null;
    expect(await getUnreadCount()).toBe(0);
  });
});

describe("listNotifications", () => {
  it("returns newest-first with parsed payload and ms times", async () => {
    await seed("n1", { createdAt: new Date(1700000001000) });
    await seed("n2", {
      createdAt: new Date(1700000002000),
      payload: JSON.stringify({ description: "Rent" }),
    });
    const rows = await listNotifications();
    expect(rows.map((r) => r.id)).toEqual(["n2", "n1"]);
    expect(rows[0].payload.description).toBe("Rent");
    expect(rows[0].createdAt).toBe(1700000002000);
    expect(rows[0].readAt).toBeNull();
  });

  it("resolves live invite state: pending / accepted / gone", async () => {
    const invite = (memberId: string, id: string) =>
      seed(id, {
        type: "invite.received",
        payload: JSON.stringify({
          memberId,
          householdName: "Home",
          invitedBy: "A",
        }),
      });
    await invite("m-pending", "n1");
    await invite("m-claimed", "n2");
    await invite("m-deleted", "n3");
    const byId = new Map((await listNotifications()).map((r) => [r.id, r]));
    expect(byId.get("n1")?.inviteState).toBe("pending");
    expect(byId.get("n2")?.inviteState).toBe("accepted");
    expect(byId.get("n3")?.inviteState).toBe("gone");
  });

  it("returns [] for superadmin", async () => {
    await seed("n1", {});
    actorState.actor = { kind: "superadmin" };
    expect(await listNotifications()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/queries/notification-queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/queries/notification-queries.ts`**

```ts
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, notifications } from "@/lib/db/schema";
import type { NotificationType } from "@/lib/notifications";

export type InviteState = "pending" | "accepted" | "gone";

export interface NotificationItemData {
  id: string;
  type: NotificationType;
  householdId: string | null;
  payload: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
  /** Only on invite.received — resolved live from household_members. */
  inviteState?: InviteState;
}

/** Unread notifications for the current user (0 for superadmin/signed-out). */
export async function getUnreadCount(): Promise<number> {
  const actor = await getCurrentActor();
  if (actor?.kind !== "user") return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)),
    );
  return row?.n ?? 0;
}

/** Newest-first notifications for the current user, payload parsed, invite
 *  state resolved live so items never go stale. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationItemData[]> {
  const actor = await getCurrentActor();
  if (actor?.kind !== "user") return [];

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);

  const items: NotificationItemData[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    householdId: r.householdId,
    payload: safeParse(r.payload),
    readAt: r.readAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  }));

  // Resolve invite state from the live invite rows in one batch.
  const memberIds = items
    .filter((i) => i.type === "invite.received")
    .map((i) => i.payload.memberId)
    .filter((v): v is string => typeof v === "string");
  const members = memberIds.length
    ? await db
        .select({ id: householdMembers.id, userId: householdMembers.userId })
        .from(householdMembers)
        .where(inArray(householdMembers.id, memberIds))
    : [];
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const item of items) {
    if (item.type !== "invite.received") continue;
    const member = byId.get(item.payload.memberId as string);
    item.inviteState = !member
      ? "gone"
      : member.userId
        ? "accepted"
        : "pending";
  }
  return items;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/queries/notification-queries.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/notification-queries.ts src/lib/queries/notification-queries.test.ts
git commit -m "feat(notifications): unread count + list queries with live invite state"
```

---

### Task 5: Actions — `acceptInvite`, `declineInvite`, `markAllNotificationsRead`, `loadNotifications`

**Files:**
- Create: `src/lib/actions/notification-actions.ts`
- Test: `src/lib/actions/notification-actions.test.ts`

**Interfaces:**
- Consumes: `notify`, payload types (Task 2); `listNotifications`, `NotificationItemData` (Task 4); `actorLabelFor` NOT needed here.
- Produces (all `safeAction`-wrapped):
  - `acceptInvite(memberId: string): Promise<{ success: true } | { error: string }>`
  - `declineInvite(memberId: string): Promise<{ success: true } | { error: string }>`
  - `markAllNotificationsRead(): Promise<{ success: true } | { error: string }>`
  - `loadNotifications(): Promise<{ success: true; items: NotificationItemData[] } | { error: string }>` (dropdown fetch, limit 10 — same pattern as `loadMoreActivity`)

- [ ] **Step 1: Write the failing tests**

`src/lib/actions/notification-actions.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { and, eq, isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  acceptInvite,
  declineInvite,
  markAllNotificationsRead,
} from "@/lib/actions/notification-actions";
import { db } from "@/lib/db";
import {
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";

const INVITEE = { kind: "user", userId: "u2", email: "cara@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Admin", email: "a@x.com" });
  await db.insert(users).values({ id: "u2", name: "Cara", email: "cara@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values({
    id: "m-admin",
    householdId: "h1",
    userId: "u1",
    email: "a@x.com",
    name: "Admin",
    role: "admin",
  });
});

beforeEach(async () => {
  actorState.actor = INVITEE;
  await db.delete(notifications);
  await db
    .delete(householdMembers)
    .where(eq(householdMembers.householdId, "h1"))
    .then(() =>
      db.insert(householdMembers).values({
        id: "m-admin",
        householdId: "h1",
        userId: "u1",
        email: "a@x.com",
        name: "Admin",
        role: "admin",
      }),
    );
  await db.insert(householdMembers).values({
    id: "m-invite",
    householdId: "h1",
    email: "cara@x.com",
    name: "cara",
    role: "member",
  });
});

describe("acceptInvite", () => {
  it("claims the invite and notifies household admins", async () => {
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(row.userId).toBe("u2");
    const admin = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(admin).toHaveLength(1);
    expect(admin[0].type).toBe("invite.accepted");
    expect(JSON.parse(admin[0].payload).accepterName).toBe("Cara");
  });

  it("rejects someone else's invite without leaking existence", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "a@x.com" };
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });

  it("is idempotent: second accept reports no longer available", async () => {
    await acceptInvite("m-invite");
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });

  it("treats already-a-member (unique conflict) as success and drops the row", async () => {
    // u2 already a linked member of h1 via a different row…
    await db.insert(householdMembers).values({
      id: "m-existing",
      householdId: "h1",
      userId: "u2",
      name: "Cara",
      role: "member",
    });
    const result = await acceptInvite("m-invite");
    expect(result).toEqual({ success: true });
    const leftovers = await db
      .select()
      .from(householdMembers)
      .where(
        and(eq(householdMembers.id, "m-invite"), isNull(householdMembers.userId)),
      );
    expect(leftovers).toHaveLength(0);
  });
});

describe("declineInvite", () => {
  it("deletes the pending row and notifies admins", async () => {
    const result = await declineInvite("m-invite");
    expect(result).toEqual({ success: true });
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-invite"));
    expect(rows).toHaveLength(0);
    const admin = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, "u1"));
    expect(admin).toHaveLength(1);
    expect(admin[0].type).toBe("invite.declined");
  });

  it("rejects someone else's invite", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "a@x.com" };
    const result = await declineInvite("m-invite");
    expect(result).toEqual({ error: "Invite no longer available" });
  });
});

describe("markAllNotificationsRead", () => {
  it("clears unread for the current user only", async () => {
    await db.insert(notifications).values([
      { id: "n1", userId: "u2", type: "expense.large", payload: "{}" },
      { id: "n2", userId: "u1", type: "expense.large", payload: "{}" },
    ]);
    const result = await markAllNotificationsRead();
    expect(result).toEqual({ success: true });
    const [mine] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n1"));
    const [theirs] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n2"));
    expect(mine.readAt).not.toBeNull();
    expect(theirs.readAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/actions/notification-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/actions/notification-actions.ts`**

```ts
"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, households, notifications, users } from "@/lib/db/schema";
import {
  type InviteAcceptedPayload,
  type InviteDeclinedPayload,
  notify,
} from "@/lib/notifications";
import { listNotifications } from "@/lib/queries/notification-queries";
import { safeAction } from "./safe-action";

const INVITE_GONE = "Invite no longer available";

/** Linked admins of a household, excluding one user (the actor). */
async function adminUserIds(
  householdId: string,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.role, "admin"),
        ne(householdMembers.userId, excludeUserId),
      ),
    );
  return rows
    .map((r) => r.userId)
    .filter((v): v is string => typeof v === "string");
}

async function householdName(id: string): Promise<string> {
  const [row] = await db
    .select({ name: households.name })
    .from(households)
    .where(eq(households.id, id))
    .limit(1);
  return row?.name ?? "a household";
}

export const acceptInvite = safeAction(
  "acceptInvite",
  async (memberId: string) => {
    const actor = await getCurrentActor();
    if (!actor || actor.kind !== "user") return { error: "Not authenticated" };
    const email = actor.email.trim().toLowerCase();

    // Guarded claim: only YOUR pending invite is claimable (fail closed).
    let claimed: { householdId: string }[];
    try {
      claimed = await db
        .update(householdMembers)
        .set({ userId: actor.userId })
        .where(
          and(
            eq(householdMembers.id, memberId),
            eq(householdMembers.email, email),
            isNull(householdMembers.userId),
          ),
        )
        .returning({ householdId: householdMembers.householdId });
    } catch (err) {
      // (householdId, userId) unique index: already a member — the pending
      // row is redundant; drop it and treat as success.
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        await db
          .delete(householdMembers)
          .where(
            and(
              eq(householdMembers.id, memberId),
              eq(householdMembers.email, email),
              isNull(householdMembers.userId),
            ),
          );
        return { success: true };
      }
      throw err;
    }
    if (claimed.length === 0) return { error: INVITE_GONE };
    const householdId = claimed[0].householdId;

    const [me] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const payload: InviteAcceptedPayload = {
      accepterName: me?.name ?? actor.email,
      householdName: await householdName(householdId),
    };
    await notify({
      userIds: await adminUserIds(householdId, actor.userId),
      type: "invite.accepted",
      householdId,
      payload: { ...payload },
    });
    await logActivity({
      householdId,
      action: "member.update",
      summary: "accepted an invite",
    });
    // New membership changes the switcher + every scoped list.
    revalidatePath("/", "layout");
    return { success: true };
  },
);

export const declineInvite = safeAction(
  "declineInvite",
  async (memberId: string) => {
    const actor = await getCurrentActor();
    if (!actor || actor.kind !== "user") return { error: "Not authenticated" };
    const email = actor.email.trim().toLowerCase();

    const deleted = await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.email, email),
          isNull(householdMembers.userId),
        ),
      )
      .returning({ householdId: householdMembers.householdId });
    if (deleted.length === 0) return { error: INVITE_GONE };
    const householdId = deleted[0].householdId;

    const payload: InviteDeclinedPayload = {
      invitedEmail: actor.email,
      householdName: await householdName(householdId),
    };
    await notify({
      userIds: await adminUserIds(householdId, actor.userId),
      type: "invite.declined",
      householdId,
      payload: { ...payload },
    });
    revalidatePath("/members");
    return { success: true };
  },
);

export const markAllNotificationsRead = safeAction(
  "markAllNotificationsRead",
  async () => {
    const actor = await getCurrentActor();
    if (!actor || actor.kind !== "user") return { error: "Not authenticated" };
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, actor.userId),
          isNull(notifications.readAt),
        ),
      );
    return { success: true };
  },
);

/** Dropdown fetch (same client-read pattern as loadMoreActivity). */
export const loadNotifications = safeAction("loadNotifications", async () => {
  return { success: true as const, items: await listNotifications(10) };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/actions/notification-actions.test.ts`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/notification-actions.ts src/lib/actions/notification-actions.test.ts
git commit -m "feat(notifications): in-app invite accept/decline + mark-read actions"
```

---

### Task 6: Emitters — `settlement.recorded` + `expense.large`

**Files:**
- Modify: `src/lib/actions/settlement-actions.ts` (`createSettlement`)
- Modify: `src/lib/actions/expense-actions.ts` (`createExpense` only — updates/imports deliberately do NOT emit, per spec)
- Test: `src/lib/actions/notification-emitters.test.ts`

**Interfaces:**
- Consumes: `notify`, `SettlementRecordedPayload`, `ExpenseLargePayload` (Task 2), `actorLabelFor` (Task 3), `households.notifyExpenseOverMinor` (Task 1).

- [ ] **Step 1: Write the failing tests**

`src/lib/actions/notification-emitters.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createExpense } from "@/lib/actions/expense-actions";
import { createSettlement } from "@/lib/actions/settlement-actions";
import { db } from "@/lib/db";
import {
  categories,
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ALICE = { kind: "user", userId: "u1", email: "alice@x.com" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "Alice", email: "alice@x.com" },
    { id: "u2", name: "Bob", email: "bob@x.com" },
  ]);
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    // Alice + Bob are linked; Cook is attribution-only (no account).
    { id: "mA", householdId: "h1", userId: "u1", email: "alice@x.com", name: "Alice", role: "admin" },
    { id: "mB", householdId: "h1", userId: "u2", email: "bob@x.com", name: "Bob", role: "member" },
    { id: "mC", householdId: "h1", name: "Cook", role: "member" },
  ]);
  await db.insert(categories).values({
    id: "c1",
    householdId: "h1",
    name: "General",
  });
});

beforeEach(async () => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ALICE;
  await db.delete(notifications);
  await db
    .update(households)
    .set({ notifyExpenseOverMinor: null })
    .where(eq(households.id, "h1"));
});

function settlementForm(from: string, to: string) {
  const fd = new FormData();
  fd.set("fromMemberId", from);
  fd.set("toMemberId", to);
  fd.set("amount", "50");
  fd.set("date", "2026-07-07");
  return fd;
}

function expenseForm(amount: string) {
  const fd = new FormData();
  fd.set("amount", amount);
  fd.set("description", "Groceries");
  fd.set("categoryId", "c1");
  fd.set("memberId", "mA");
  fd.set("date", "2026-07-07");
  return fd;
}

describe("createSettlement → settlement.recorded", () => {
  it("notifies the linked counterparty, not the actor", async () => {
    const result = await createSettlement(settlementForm("mA", "mB"));
    expect(result).toEqual({ success: true });
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u2");
    expect(rows[0].type).toBe("settlement.recorded");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.amountMinor).toBe(5000);
    expect(payload.currency).toBe("INR");
    expect(payload.fromName).toBe("Alice");
    expect(payload.toName).toBe("Bob");
  });

  it("stays silent when the counterparty has no account", async () => {
    await createSettlement(settlementForm("mA", "mC"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});

describe("createExpense → expense.large", () => {
  it("does not emit when the threshold is off", async () => {
    await createExpense(expenseForm("999"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("notifies other linked members at/above the threshold", async () => {
    await db
      .update(households)
      .set({ notifyExpenseOverMinor: 50000 }) // ₹500
      .where(eq(households.id, "h1"));
    await createExpense(expenseForm("500")); // exactly at the boundary
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(1); // Bob only — not Alice (actor), not Cook
    expect(rows[0].userId).toBe("u2");
    expect(rows[0].type).toBe("expense.large");
    const payload = JSON.parse(rows[0].payload);
    expect(payload.description).toBe("Groceries");
    expect(payload.actorLabel).toBe("Alice");
  });

  it("stays silent below the threshold", async () => {
    await db
      .update(households)
      .set({ notifyExpenseOverMinor: 50000 })
      .where(eq(households.id, "h1"));
    await createExpense(expenseForm("499.99"));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/actions/notification-emitters.test.ts`
Expected: FAIL — 0 notification rows in the positive cases.

- [ ] **Step 3: Emit from `createSettlement`**

In `src/lib/actions/settlement-actions.ts`:

Add imports:

```ts
import { getCurrentActor } from "@/lib/auth/actor";
import { notify, type SettlementRecordedPayload } from "@/lib/notifications";
```

Change the members select (line ~37) to include `userId`:

```ts
    const members = await db
      .select({
        id: householdMembers.id,
        name: householdMembers.name,
        userId: householdMembers.userId,
      })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, household.id),
          eq(householdMembers.includeInSettleUp, true),
        ),
      );
    const byId = new Map(members.map((m) => [m.id, m]));
```

Update the two `byId.get(...)` usages in the `logActivity` summary to `byId.get(parsed.data.fromMemberId)?.name` / `byId.get(parsed.data.toMemberId)?.name`.

After `logActivity`, before `revalidatePath("/settle-up")`:

```ts
    // Notify the linked counterparty (never the actor, never unlinked rows).
    const actor = await getCurrentActor();
    const actorUserId = actor?.kind === "user" ? actor.userId : null;
    const recipients = [
      byId.get(parsed.data.fromMemberId)?.userId,
      byId.get(parsed.data.toMemberId)?.userId,
    ].filter((id): id is string => !!id && id !== actorUserId);
    const payload: SettlementRecordedPayload = {
      amountMinor: toMinorUnits(parsed.data.amount),
      currency: household.currency,
      fromName: byId.get(parsed.data.fromMemberId)?.name ?? "someone",
      toName: byId.get(parsed.data.toMemberId)?.name ?? "someone",
      householdName: household.name,
    };
    await notify({
      userIds: recipients,
      type: "settlement.recorded",
      householdId: household.id,
      payload: { ...payload },
    });
```

- [ ] **Step 4: Emit from `createExpense`**

In `src/lib/actions/expense-actions.ts`:

Add imports:

```ts
import { actorLabelFor } from "@/lib/activity"; // merge with logActivity import
import { getCurrentActor } from "@/lib/auth/actor";
import { type ExpenseLargePayload, notify } from "@/lib/notifications";
```

In `createExpense`, after `logActivity` and before the `revalidatePath` calls:

```ts
    // Threshold notification: only on CREATE (updates/imports never emit).
    const threshold = household.notifyExpenseOverMinor ?? 0;
    const amountMinor = toMinorUnits(parsed.data.amount);
    if (threshold > 0 && amountMinor >= threshold) {
      const actor = await getCurrentActor();
      const actorUserId = actor?.kind === "user" ? actor.userId : null;
      const linked = await db
        .select({ userId: householdMembers.userId })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));
      const recipients = linked
        .map((m) => m.userId)
        .filter((id): id is string => !!id && id !== actorUserId);
      const { actorLabel } = await actorLabelFor(household.id);
      const payload: ExpenseLargePayload = {
        amountMinor,
        currency: household.currency,
        description: parsed.data.description,
        actorLabel,
        householdName: household.name,
      };
      await notify({
        userIds: recipients,
        type: "expense.large",
        householdId: household.id,
        payload: { ...payload },
      });
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/actions/notification-emitters.test.ts && pnpm test src/lib/actions/settlement-actions.test.ts`
Expected: all PASS (settlement suite guards the `byId` map refactor).

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/settlement-actions.ts src/lib/actions/expense-actions.ts src/lib/actions/notification-emitters.test.ts
git commit -m "feat(notifications): settlement + large-expense emitters"
```

---

### Task 7: Threshold setting — validator + action + Settings UI

**Files:**
- Modify: `src/lib/validators/settings-schema.ts`
- Modify: `src/lib/actions/settings-actions.ts`
- Modify: `src/lib/auth/membership.ts` (add `memberRole`)
- Create: `src/components/settings/expense-notify-threshold.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Test: create `src/lib/actions/settings-actions.test.ts`

**Interfaces:**
- Produces:
  - `expenseNotifyThresholdSchema` — Zod schema for `{ amount: "" | number }` (major units, 0–100,000,000, ≤2dp handled by coercion+round in the action).
  - `updateExpenseNotifyThreshold(formData: FormData)` — `safeAction`; admin-only (same role check as `inviteToHousehold`); `""`/`0` → `null` (off); stores minor units.
  - `memberRole(userId: string, householdId: string): Promise<"admin" | "member" | null>` in `@/lib/auth/membership`.
  - `<ExpenseNotifyThreshold current={number | null} />` client component (current in **major** units).

- [ ] **Step 1: Write the failing tests**

`src/lib/actions/settings-actions.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});
const actorState = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { updateExpenseNotifyThreshold } from "@/lib/actions/settings-actions";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ADMIN = { kind: "user", userId: "u1", email: "a@x.com" } as const;
const MEMBER = { kind: "user", userId: "u2", email: "b@x.com" } as const;

function form(amount: string) {
  const fd = new FormData();
  fd.set("amount", amount);
  return fd;
}

async function threshold() {
  const [h] = await db
    .select({ v: households.notifyExpenseOverMinor })
    .from(households)
    .where(eq(households.id, "h1"));
  return h.v;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "Admin", email: "a@x.com" },
    { id: "u2", name: "Member", email: "b@x.com" },
  ]);
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", userId: "u1", name: "Admin", role: "admin" },
    { id: "m2", householdId: "h1", userId: "u2", name: "Member", role: "member" },
  ]);
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ADMIN;
});

describe("updateExpenseNotifyThreshold", () => {
  it("stores major units as minor units", async () => {
    const result = await updateExpenseNotifyThreshold(form("500"));
    expect(result).toEqual({ success: true });
    expect(await threshold()).toBe(50000);
  });

  it("empty and zero turn the threshold off (null)", async () => {
    await updateExpenseNotifyThreshold(form("500"));
    await updateExpenseNotifyThreshold(form(""));
    expect(await threshold()).toBeNull();
    await updateExpenseNotifyThreshold(form("500"));
    await updateExpenseNotifyThreshold(form("0"));
    expect(await threshold()).toBeNull();
  });

  it("rejects a non-admin member", async () => {
    actorState.actor = MEMBER;
    const result = await updateExpenseNotifyThreshold(form("500"));
    expect(result.error).toMatch(/admin/i);
  });

  it("rejects a negative amount", async () => {
    const result = await updateExpenseNotifyThreshold(form("-5"));
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/actions/settings-actions.test.ts`
Expected: FAIL — `updateExpenseNotifyThreshold` not exported.

- [ ] **Step 3: Add the schema**

Append to `src/lib/validators/settings-schema.ts`:

```ts
/** Major units; "" = off. Stored as minor units (null when off). */
export const expenseNotifyThresholdSchema = z.object({
  amount: z.union([
    z.literal(""),
    z.coerce.number().min(0, "Must be 0 or more").max(100_000_000),
  ]),
});
```

- [ ] **Step 4: Add the action**

Append to `src/lib/actions/settings-actions.ts` (add imports: `and`, `householdMembers` from schema, `getCurrentActor`, `toMinorUnits`, `expenseNotifyThresholdSchema`):

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/lib/actions/settings-actions.test.ts`
Expected: 4 PASS.

- [ ] **Step 6: Add `memberRole` to `src/lib/auth/membership.ts`**

```ts
/** The user's role in a household, or null when not a linked member. */
export async function memberRole(
  userId: string,
  householdId: string,
): Promise<"admin" | "member" | null> {
  const [row] = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}
```

- [ ] **Step 7: Create `src/components/settings/expense-notify-threshold.tsx`**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateExpenseNotifyThreshold } from "@/lib/actions/settings-actions";

export function ExpenseNotifyThreshold({
  current,
}: {
  current: number | null; // major units, null = off
}) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      const result = await updateExpenseNotifyThreshold(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Notification threshold saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-2">
      <Input
        type="number"
        name="amount"
        min="0"
        step="0.01"
        defaultValue={current ?? ""}
        placeholder="Off"
        aria-label="Notify members about expenses over this amount"
        className="max-w-40"
      />
      <Button type="submit" variant="outline" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Wire into `src/app/(app)/settings/page.tsx`**

Add imports:

```ts
import { ExpenseNotifyThreshold } from "@/components/settings/expense-notify-threshold";
import { getCurrentActor } from "@/lib/auth/actor";
import { memberRole } from "@/lib/auth/membership";
```

At the top of the component, resolve admin-ness (superadmin counts as admin):

```ts
  const household = await getCurrentHousehold();
  const actor = await getCurrentActor();
  const isAdmin =
    actor?.kind === "superadmin" ||
    (actor?.kind === "user" && household
      ? (await memberRole(actor.userId, household.id)) === "admin"
      : false);
```

Inside the household `CardContent`, after the currency block:

```tsx
            {isAdmin && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Expense notifications</p>
                <ExpenseNotifyThreshold
                  current={
                    household.notifyExpenseOverMinor
                      ? household.notifyExpenseOverMinor / 100
                      : null
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Notify other members when someone adds an expense at or above
                  this amount. Leave empty to turn off.
                </p>
              </div>
            )}
```

- [ ] **Step 9: Verify lint/typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/validators/settings-schema.ts src/lib/actions/settings-actions.ts src/lib/actions/settings-actions.test.ts src/lib/auth/membership.ts src/components/settings/expense-notify-threshold.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat(settings): admin-only expense notification threshold"
```

---

### Task 8: Count poll route — GET `/api/notifications/count`

**Files:**
- Create: `src/app/api/notifications/count/route.ts`
- Test: `src/app/api/notifications/count/route.test.ts`

**Interfaces:**
- Consumes: `getUnreadCount` (Task 4).
- Produces: `GET` → `200 {"count": number}` (0 when signed out / superadmin). This is the documented exception to "no API routes" (precedent: `/api/cron/cleanup`). Note: the proxy matcher (`src/proxy.ts`) already covers `/api/notifications/*`, so unauthenticated browsers are redirected before reaching it — the client poll (Task 11) guards on the JSON content type.

- [ ] **Step 1: Write the failing test**

`src/app/api/notifications/count/route.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

const actorState = vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  return { actor: null as unknown };
});
vi.mock("@/lib/auth/actor", () => ({
  getCurrentActor: async () => actorState.actor,
}));

import { migrate } from "drizzle-orm/libsql/migrator";
import { GET } from "@/app/api/notifications/count/route";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Me", email: "me@x.com" });
  await db.insert(notifications).values({
    id: "n1",
    userId: "u1",
    type: "expense.large",
    payload: "{}",
  });
});

describe("GET /api/notifications/count", () => {
  it("returns the unread count for a user", async () => {
    actorState.actor = { kind: "user", userId: "u1", email: "me@x.com" };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 1 });
  });

  it("returns 0 when signed out", async () => {
    actorState.actor = null;
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/notifications/count/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

`src/app/api/notifications/count/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getUnreadCount } from "@/lib/queries/notification-queries";

// Polled by the header bell (~60s, tab-visible only). A read this frequent is
// the one place a GET route beats a Server Action POST — documented exception
// to the "Server Actions for everything" convention.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ count: await getUnreadCount() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/notifications/count/route.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/count/
git commit -m "feat(notifications): unread-count poll route"
```

---

### Task 9: `NotificationItem` shared component

**Files:**
- Create: `src/components/notifications/notification-item.tsx`
- Test: `src/lib/notification-text.test.ts` (pure helper) — helper lives in `src/lib/notification-text.ts`

**Interfaces:**
- Consumes: `NotificationItemData`, `InviteState` (Task 4); `acceptInvite`, `declineInvite` (Task 5).
- Produces:
  - `notificationText(item: NotificationItemData): { title: string; detail: string }` in `src/lib/notification-text.ts` (pure, client-safe — used for rendering and tested in isolation).
  - `<NotificationItem item={NotificationItemData} onActioned?: () => void />` client component: renders icon/title/detail/relative time; for `invite.received` + `inviteState === "pending"` shows Accept/Decline.

- [ ] **Step 1: Write the failing test for the pure text helper**

`src/lib/notification-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { notificationText } from "@/lib/notification-text";

const base = { id: "n1", householdId: "h1", readAt: null, createdAt: 0 };

describe("notificationText", () => {
  it("invite.received", () => {
    const { title, detail } = notificationText({
      ...base,
      type: "invite.received",
      payload: { memberId: "m1", householdName: "Home", invitedBy: "Nanda" },
    });
    expect(title).toBe("Invitation to Home");
    expect(detail).toBe("Nanda invited you to join this household");
  });

  it("settlement.recorded formats the amount in the payload currency", () => {
    const { title, detail } = notificationText({
      ...base,
      type: "settlement.recorded",
      payload: {
        amountMinor: 50000,
        currency: "INR",
        fromName: "Alice",
        toName: "Bob",
        householdName: "Home",
      },
    });
    expect(title).toBe("Payment recorded in Home");
    expect(detail).toContain("Alice");
    expect(detail).toContain("Bob");
    expect(detail).toContain("500");
  });

  it("expense.large includes description and actor", () => {
    const { detail } = notificationText({
      ...base,
      type: "expense.large",
      payload: {
        amountMinor: 123456,
        currency: "INR",
        description: "New sofa",
        actorLabel: "Bob",
        householdName: "Home",
      },
    });
    expect(detail).toContain("Bob");
    expect(detail).toContain("New sofa");
  });

  it("tolerates a missing/garbled payload", () => {
    const { title } = notificationText({
      ...base,
      type: "invite.accepted",
      payload: {},
    });
    expect(title.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/notification-text.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/notification-text.ts`**

```ts
import type { NotificationItemData } from "@/lib/queries/notification-queries";

/** Format minor units in the currency snapshotted at emit time (notifications
 *  span households, so the active household's CurrencyProvider is wrong here). */
export function formatMinor(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v ? v : fallback;
const num = (v: unknown) => (typeof v === "number" ? v : 0);

/** One-line title + detail per notification type. Pure and defensive: any
 *  missing payload field degrades to a generic label, never a crash. */
export function notificationText(item: NotificationItemData): {
  title: string;
  detail: string;
} {
  const p = item.payload;
  const household = str(p.householdName, "a household");
  switch (item.type) {
    case "invite.received":
      return {
        title: `Invitation to ${household}`,
        detail: `${str(p.invitedBy, "Someone")} invited you to join this household`,
      };
    case "invite.accepted":
      return {
        title: `Invite accepted in ${household}`,
        detail: `${str(p.accepterName, "Someone")} joined the household`,
      };
    case "invite.declined":
      return {
        title: `Invite declined in ${household}`,
        detail: `${str(p.invitedEmail, "Someone")} declined the invitation`,
      };
    case "settlement.recorded":
      return {
        title: `Payment recorded in ${household}`,
        detail: `${str(p.fromName, "Someone")} paid ${formatMinor(num(p.amountMinor), str(p.currency, "INR"))} to ${str(p.toName, "someone")}`,
      };
    case "expense.large":
      return {
        title: `Large expense in ${household}`,
        detail: `${str(p.actorLabel, "Someone")} added "${str(p.description, "an expense")}" — ${formatMinor(num(p.amountMinor), str(p.currency, "INR"))}`,
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/notification-text.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Implement `src/components/notifications/notification-item.tsx`**

```tsx
"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  HandCoins,
  type LucideIcon,
  ReceiptText,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  acceptInvite,
  declineInvite,
} from "@/lib/actions/notification-actions";
import { notificationText } from "@/lib/notification-text";
import type { NotificationItemData } from "@/lib/queries/notification-queries";

const ICONS: Record<NotificationItemData["type"], LucideIcon> = {
  "invite.received": UserPlus,
  "invite.accepted": UserCheck,
  "invite.declined": UserX,
  "settlement.recorded": HandCoins,
  "expense.large": ReceiptText,
};

export function NotificationItem({
  item,
  onActioned,
}: {
  item: NotificationItemData;
  onActioned?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(
    null,
  );
  const Icon = ICONS[item.type] ?? Bell;
  const { title, detail } = notificationText(item);
  const memberId =
    typeof item.payload.memberId === "string" ? item.payload.memberId : null;
  const pending =
    item.type === "invite.received" &&
    item.inviteState === "pending" &&
    !resolved &&
    memberId !== null;

  async function act(kind: "accept" | "decline") {
    if (!memberId) return;
    setBusy(true);
    try {
      const action = kind === "accept" ? acceptInvite : declineInvite;
      const result = await action(memberId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setResolved(kind === "accept" ? "accepted" : "declined");
      toast.success(kind === "accept" ? "Invite accepted" : "Invite declined");
      if (kind === "accept") router.refresh();
      onActioned?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3 rounded-xl p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-sm leading-tight">{title}</p>
        <p className="text-muted-foreground text-sm">{detail}</p>
        <p className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </p>
        {pending && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="min-h-11 flex-1"
              disabled={busy}
              onClick={() => act("accept")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 flex-1"
              disabled={busy}
              onClick={() => act("decline")}
            >
              Decline
            </Button>
          </div>
        )}
        {item.type === "invite.received" && !pending && (
          <p className="text-muted-foreground text-xs">
            {resolved === "accepted" || item.inviteState === "accepted"
              ? "Accepted"
              : resolved === "declined"
                ? "Declined"
                : "No longer available"}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify lint/typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notification-text.ts src/lib/notification-text.test.ts src/components/notifications/notification-item.tsx
git commit -m "feat(notifications): shared notification item with inline invite actions"
```

---

### Task 10: `NotificationBell` + header + layout wiring

**Files:**
- Create: `src/components/notifications/notification-bell.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `loadNotifications`, `markAllNotificationsRead` (Task 5); `NotificationItem` (Task 9); `getUnreadCount` (Task 4); GET route (Task 8).
- Produces: `<NotificationBell initialCount={number} />`; `Header` gains prop `unreadCount?: number | null` (null = hide bell, the default).

- [ ] **Step 1: Implement `src/components/notifications/notification-bell.tsx`**

```tsx
"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  loadNotifications,
  markAllNotificationsRead,
} from "@/lib/actions/notification-actions";
import type { NotificationItemData } from "@/lib/queries/notification-queries";

const POLL_MS = 60_000;

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState<NotificationItemData[] | null>(null);
  const [open, setOpen] = useState(false);

  // Poll the unread count while the tab is visible. Silent on any failure —
  // the badge self-corrects on the next poll or navigation.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/notifications/count");
        if (
          !res.ok ||
          !res.headers.get("content-type")?.includes("application/json")
        )
          return;
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      } catch {
        // ignore — transient network/auth issues must not surface here
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function refreshList() {
    const result = await loadNotifications();
    if (result && "items" in result) setItems(result.items);
  }

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setCount(0); // optimistic — mark-all-read follows
    setItems(null);
    await refreshList();
    await markAllNotificationsRead();
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              count > 0 ? `Notifications (${count} unread)` : "Notifications"
            }
            className="relative"
          />
        }
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="-top-0.5 -right-0.5 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <p className="px-4 pt-3 pb-2 font-display font-semibold text-sm">
          Notifications
        </p>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto p-1">
          {items === null ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">
              You're all caught up.
            </p>
          ) : (
            items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                onActioned={refreshList}
              />
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block min-h-11 px-4 py-3 text-center font-medium text-primary text-sm hover:bg-muted"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire into `Header`**

In `src/components/layout/header.tsx`:

```ts
import { NotificationBell } from "@/components/notifications/notification-bell";
```

Add prop (default null = hidden — signed-out and superadmin):

```ts
export function Header({
  user,
  householdName,
  isSuperadmin = false,
  unreadCount = null,
}: {
  user: HeaderUser | null;
  householdName?: string | null;
  isSuperadmin?: boolean;
  unreadCount?: number | null;
}) {
```

In the right-side actions div, before the `ThemeToggle` wrapper (bell visible on all breakpoints):

```tsx
        <div className="flex items-center gap-2">
          {unreadCount !== null && (
            <NotificationBell initialCount={unreadCount} />
          )}
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
```

- [ ] **Step 3: Wire into the app layout**

In `src/app/(app)/layout.tsx`:

```ts
import { getUnreadCount } from "@/lib/queries/notification-queries";
```

Extend the `Promise.all`:

```ts
  const [household, householdList, session, actor, unreadCount] =
    await Promise.all([
      getCurrentHousehold(),
      listHouseholds(),
      auth(),
      getCurrentActor(),
      getUnreadCount(),
    ]);
```

And pass it (bell only for user actors — `getUnreadCount` already returns 0 for others, but `null` is what hides it):

```tsx
            <Header
              user={session?.user ?? null}
              householdName={household?.name ?? null}
              isSuperadmin={actor?.kind === "superadmin"}
              unreadCount={actor?.kind === "user" ? unreadCount : null}
            />
```

- [ ] **Step 4: Verify lint, typecheck, and full test suite**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`
Expected: clean, all PASS.

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`, sign in as a Google user (or seed a dev user), confirm: bell renders with badge, dropdown opens and lists items, badge clears on open, superadmin (`/admin` passcode) sees no bell.

- [ ] **Step 6: Commit**

```bash
git add src/components/notifications/notification-bell.tsx src/components/layout/header.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(notifications): header bell with unread badge and 60s poll"
```

---

### Task 11: `/notifications` page + loading skeleton

**Files:**
- Create: `src/app/(app)/notifications/page.tsx`
- Create: `src/app/(app)/notifications/loading.tsx`

**Interfaces:**
- Consumes: `listNotifications` (Task 4), `NotificationItem` (Task 9), `PageHeader`, `EmptyState`.

- [ ] **Step 1: Implement `src/app/(app)/notifications/page.tsx`**

Note: unlike other pages, there is NO `NoHousehold` gate — a user with zero households must still see their invites here (that's the first-invite case).

```tsx
import { Bell } from "lucide-react";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listNotifications } from "@/lib/queries/notification-queries";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const items = await listNotifications(50);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Invites and activity across your households"
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Household invites, payments, and large expenses will show up here."
        />
      ) : (
        <Card className="rounded-2xl border-0 bg-card shadow-card">
          <CardContent className="divide-y divide-border p-2">
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/app/(app)/notifications/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
        {Array.from({ length: 5 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          <div key={i} className="flex gap-3 p-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: clean build (`/notifications` compiles as a dynamic route).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/notifications/"
git commit -m "feat(notifications): /notifications history page"
```

---

### Task 12: e2e guard, full verification, memory

**Files:**
- Modify: `e2e/dashboard.spec.ts` (one assertion)
- Modify: `memory.md` (work-log entry)

- [ ] **Step 1: Add the superadmin bell-absence assertion**

In `e2e/dashboard.spec.ts`, inside the existing logged-in (passcode) test, after the dashboard heading assertion, add:

```ts
  // Superadmin (passcode auth) has no userId → the notification bell is hidden.
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
```

(Per `.claude/rules/playwright.md`: no `getByRole("alert")`; passcode auth only.)

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (requires the seeded e2e DB per `playwright.config.ts` webServer).

- [ ] **Step 3: Full verification**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: everything green.

- [ ] **Step 4: Update `memory.md`**

Append a dated work-log entry under `## Work log` summarizing: notifications table + threshold column (migration 0007), `notify()` fan-out helper, in-app invite accept/decline (`acceptInvite`/`declineInvite`), emitters (invite/settlement/expense), bell + dropdown + `/notifications` page, count poll route, and the Web Push v2 hook point.

- [ ] **Step 5: Commit**

```bash
git add e2e/dashboard.spec.ts memory.md
git commit -m "test(e2e): superadmin sees no notification bell; update repo memory"
```

---

## Post-plan notes for the implementer

- **Deploy:** after merging, run `pnpm db:migrate` against prod Turso (migration 0007) — same flow as previous migrations. No env changes.
- **Out of scope (do not build):** Web Push, digests, per-user preferences, `invited_by` attribution, expense-update/import emitters, sidebar nav link for `/notifications`.
