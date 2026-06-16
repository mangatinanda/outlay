# Model B — User-Owned Households + Superadmin Passcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `household_members` a real authorization boundary so a Google user can only read/write households they belong to, while the shared passcode becomes an explicit superadmin (`/admin`) that bypasses scoping.

**Architecture:** A single `getCurrentActor()` resolves each request to `{kind:'superadmin'}` (valid passcode cookie, checked first) or `{kind:'user', userId, email}` (Google JWT session). The three central resolvers (`getCurrentHousehold`, `listHouseholds`, `switchHousehold`) plus the two id-taking household actions become actor-aware; because ~20 per-household pages/actions derive their household from `getCurrentHousehold()`, they are fixed transitively. Identity is persisted on first sign-in (JWT, no adapter). Invites are email rows on `household_members`, claimed on next login. A `SESSION_VERSION` bump invalidates all outstanding passcode cookies on deploy.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), next-auth v5 (JWT, Google), Drizzle ORM + libSQL/Turso, Zod v4, Vitest (in-memory libSQL integration tests), Biome.

**Spec:** `docs/superpowers/specs/2026-06-16-model-b-user-owned-households-design.md`

**Conventions for every task:**
- Run a single test file with `pnpm exec vitest run <path>`; the whole suite with `pnpm test`.
- Before each commit touching `.ts`/`.tsx`: `pnpm exec biome check --write .` (sorts imports + Tailwind classes) then `pnpm exec tsc --noEmit`.
- Money/identity rules unchanged; never read `.env.local` or `data/**`.

---

## Milestone 1 — Schema & identity foundation

### Task 1: Add `email` column + indexes to `household_members`

**Files:**
- Modify: `src/lib/db/schema.ts:22-40`
- Create (generated): `drizzle/0003_*.sql`
- Test: `src/lib/db/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/schema.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "hh-1", name: "Home" });
});

describe("household_members.email", () => {
  it("round-trips an email and a null userId on a pending invite", async () => {
    await db.insert(householdMembers).values({
      id: "m-1",
      householdId: "hh-1",
      email: "invitee@example.com",
      name: "invitee",
      role: "member",
    });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.id, "m-1"));
    expect(row.email).toBe("invitee@example.com");
    expect(row.userId).toBeNull();
  });

  it("rejects a duplicate (householdId, email) invite", async () => {
    await db.insert(householdMembers).values({
      id: "m-2",
      householdId: "hh-1",
      email: "dup@example.com",
      name: "dup",
      role: "member",
    });
    await expect(
      db.insert(householdMembers).values({
        id: "m-3",
        householdId: "hh-1",
        email: "dup@example.com",
        name: "dup2",
        role: "member",
      }),
    ).rejects.toThrow();
  });

  it("allows many attribution-only members (null email) in one household", async () => {
    await db.insert(householdMembers).values([
      { id: "m-4", householdId: "hh-1", name: "Kid A", role: "member" },
      { id: "m-5", householdId: "hh-1", name: "Kid B", role: "member" },
    ]);
    const rows = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, "hh-1")));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/db/schema.test.ts`
Expected: FAIL — inserting `email` errors with `table household_members has no column named email` (column doesn't exist yet).

- [ ] **Step 3: Add the column + indexes to the schema**

In `src/lib/db/schema.ts`, change the `drizzle-orm/sqlite-core` import to add `uniqueIndex`:

```ts
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
```

Add the `email` column after `userId` and replace the index array:

```ts
export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    userId: text("user_id").references(() => users.id),
    email: text("email"),
    name: text("name").notNull(),
    avatar: text("avatar"),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("household_members_household_idx").on(table.householdId),
    uniqueIndex("household_members_household_user_unq").on(
      table.householdId,
      table.userId,
    ),
    uniqueIndex("household_members_household_email_unq").on(
      table.householdId,
      table.email,
    ),
    index("household_members_email_idx").on(table.email),
  ],
);
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `drizzle/0003_*.sql` is created containing `ALTER TABLE household_members ADD column email text;` and three `CREATE INDEX` / `CREATE UNIQUE INDEX` statements. Confirm it exists: `ls drizzle | tail -3`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/db/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/db/schema.ts src/lib/db/schema.test.ts drizzle/
git commit -m "feat(db): add household_members.email + membership/invite unique indexes"
```

---

### Task 2: User-persistence + sign-in eligibility helpers

**Files:**
- Create: `src/lib/auth/users.ts`
- Test: `src/lib/auth/users.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/users.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
  // Non-empty allow-list so a non-listed email falls through to the membership
  // branch instead of being allowed by the dev-mode empty-list shortcut.
  process.env.HOUSEHOLD_ALLOWED_EMAILS = "owner@example.com";
});

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { canSignIn, claimInvites, upsertUserByEmail } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values({ id: "hh-1", name: "Home" });
});

describe("upsertUserByEmail", () => {
  it("creates a user and returns a stable id, reusing it on the next call", async () => {
    const id1 = await upsertUserByEmail({ email: "A@Example.com", name: "Ann" });
    const id2 = await upsertUserByEmail({ email: "a@example.com", name: "Ann B" });
    expect(id2).toBe(id1);
    const rows = await db.select().from(users).where(eq(users.email, "a@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ann B"); // refreshed on upsert
  });
});

describe("claimInvites", () => {
  it("links pending-invite rows matching the email to the user id", async () => {
    await db.insert(householdMembers).values({
      id: "m-1",
      householdId: "hh-1",
      email: "invitee@example.com",
      name: "invitee",
      role: "member",
    });
    const userId = await upsertUserByEmail({ email: "invitee@example.com" });
    await claimInvites("invitee@example.com", userId);
    const [row] = await db.select().from(householdMembers).where(eq(householdMembers.id, "m-1"));
    expect(row.userId).toBe(userId);
  });
});

describe("canSignIn", () => {
  it("allows an allow-listed email", async () => {
    expect(await canSignIn("owner@example.com")).toBe(true);
  });
  it("allows a non-listed email that has a membership/invite row", async () => {
    expect(await canSignIn("invitee@example.com")).toBe(true);
  });
  it("rejects a non-listed email with no membership", async () => {
    expect(await canSignIn("stranger@example.com")).toBe(false);
  });
  it("rejects a null email", async () => {
    expect(await canSignIn(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/users.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/users'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/users.ts`:

```ts
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { isEmailAllowed } from "@/lib/allow-list";
import { db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { env } from "@/lib/env";

/** Create the user row if absent (keyed on the unique email), else refresh
 *  name/image. Returns the stable users.id. */
export async function upsertUserByEmail(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ name: input.name ?? undefined, image: input.image ?? undefined })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const id = createId();
  await db.insert(users).values({
    id,
    email,
    name: input.name ?? email, // users.name is NOT NULL
    image: input.image ?? null,
  });
  return id;
}

/** Link any pending-invite rows (email set, userId null) to this user. */
export async function claimInvites(email: string, userId: string): Promise<void> {
  await db
    .update(householdMembers)
    .set({ userId })
    .where(
      and(
        eq(householdMembers.email, email.trim().toLowerCase()),
        isNull(householdMembers.userId),
      ),
    );
}

/** A Google email may enter if it is allow-listed OR already has a
 *  membership/invite row. The allow-list bootstraps the owner; invites grant
 *  entry without editing env vars. */
export async function canSignIn(
  email: string | null | undefined,
): Promise<boolean> {
  if (
    isEmailAllowed(
      email,
      env.HOUSEHOLD_ALLOWED_EMAILS,
      process.env.NODE_ENV === "production",
    )
  ) {
    return true;
  }
  if (!email) return false;
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.email, email.trim().toLowerCase()))
    .limit(1);
  return !!row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/users.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/auth/users.ts src/lib/auth/users.test.ts
git commit -m "feat(auth): user upsert, invite claim, and membership-aware canSignIn"
```

---

### Task 3: Wire Auth.js callbacks + session type augmentation

**Files:**
- Create: `src/lib/auth/callbacks.ts`
- Create: `src/types/next-auth.d.ts`
- Modify: `src/auth.ts:6-22`
- Test: `src/lib/auth/callbacks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/callbacks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyUserIdToSession } from "@/lib/auth/callbacks";

describe("applyUserIdToSession", () => {
  it("copies the userId onto session.user.id", () => {
    const session = applyUserIdToSession(
      { user: { email: "a@b.com" } },
      "user-123",
    );
    expect(session.user.id).toBe("user-123");
  });

  it("no-ops when the userId is undefined", () => {
    const session = applyUserIdToSession({ user: { email: "a@b.com" } }, undefined);
    expect(session.user.id).toBeUndefined();
  });

  it("no-ops when there is no user", () => {
    const session = applyUserIdToSession({ user: null }, "user-123");
    expect(session.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/callbacks.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/callbacks'`.

- [ ] **Step 3: Write the callback helper**

Create `src/lib/auth/callbacks.ts`:

```ts
/** Copy the resolved userId from the JWT onto the session user. Extracted so
 *  the mapping is unit-testable without booting Auth.js. */
export function applyUserIdToSession<
  T extends { user?: ({ id?: string } & Record<string, unknown>) | null },
>(session: T, userId: string | undefined): T {
  if (userId && session.user) {
    session.user.id = userId;
  }
  return session;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/callbacks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the session/JWT type augmentation**

Create `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id?: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
```

- [ ] **Step 6: Wire the callbacks into `src/auth.ts`**

Replace the whole body of `src/auth.ts` with:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { applyUserIdToSession } from "@/lib/auth/callbacks";
import { canSignIn, claimInvites, upsertUserByEmail } from "@/lib/auth/users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
  session: { strategy: "jwt" }, // stateless; user row persisted by us, no adapter
  pages: { signIn: "/login" },
  callbacks: {
    // Eligibility: allow-listed OR already has a membership/invite.
    signIn({ user }) {
      return canSignIn(user.email);
    },
    // On initial sign-in only (account present): persist the user, claim any
    // pending invites, and stamp the stable id onto the token. Later requests
    // carry the id already — no DB write.
    async jwt({ token, account }) {
      if (account && token.email) {
        const id = await upsertUserByEmail({
          email: token.email,
          name: token.name,
          image: token.picture,
        });
        await claimInvites(token.email, id);
        token.userId = id;
      }
      return token;
    },
    session({ session, token }) {
      return applyUserIdToSession(session, token.userId);
    },
  },
});
```

- [ ] **Step 7: Verify typecheck + build (middleware imports the DB transitively now)**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

Run: `pnpm build`
Expected: build succeeds. **If** it fails with a middleware/edge module error (because `auth.ts` now pulls in `@/lib/db` via `users.ts`, and `proxy.ts` imports `auth`), apply this mitigation: in `src/lib/auth/users.ts`, replace the top-level `import { db } from "@/lib/db";` with a lazy getter used inside each function — `const { db } = await import("@/lib/db");` — then re-run `pnpm build`. (The repo's proxy runs on the Node runtime, so this is a fallback, not expected.)

- [ ] **Step 8: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/auth/callbacks.ts src/lib/auth/callbacks.test.ts src/types/next-auth.d.ts src/auth.ts
git commit -m "feat(auth): persist user + userId on sign-in, augment session types"
```

---

## Milestone 2 — Authorization core

### Task 4: `getCurrentActor()` — the single principal resolver

**Files:**
- Create: `src/lib/auth/actor.ts`
- Test: `src/lib/auth/actor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/actor.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});

// Mutable mock session the @/auth mock returns.
const authState = vi.hoisted(() => ({ session: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

import { getCurrentActor } from "@/lib/auth/actor";
import { SESSION_COOKIE, signSession } from "@/lib/gate";

beforeEach(() => {
  cookieJar.clear();
  authState.session = null;
});

describe("getCurrentActor", () => {
  it("returns superadmin for a valid passcode cookie", async () => {
    cookieJar.set(SESSION_COOKIE, await signSession());
    expect(await getCurrentActor()).toEqual({ kind: "superadmin" });
  });

  it("returns a user for a Google session with id + email", async () => {
    authState.session = { user: { id: "u1", email: "a@b.com" } };
    expect(await getCurrentActor()).toEqual({
      kind: "user",
      userId: "u1",
      email: "a@b.com",
    });
  });

  it("prefers superadmin when both a passcode cookie and a session exist", async () => {
    cookieJar.set(SESSION_COOKIE, await signSession());
    authState.session = { user: { id: "u1", email: "a@b.com" } };
    expect(await getCurrentActor()).toEqual({ kind: "superadmin" });
  });

  it("returns null with neither", async () => {
    expect(await getCurrentActor()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/actor.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/actor'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/actor.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/actor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/auth/actor.ts src/lib/auth/actor.test.ts
git commit -m "feat(auth): getCurrentActor — superadmin (passcode) vs scoped user"
```

---

### Task 5: Membership helpers

**Files:**
- Create: `src/lib/auth/membership.ts`
- Test: `src/lib/auth/membership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/membership.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { migrate } from "drizzle-orm/libsql/migrator";
import {
  assertCanAccessHousehold,
  isMember,
  userHouseholds,
} from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "U1", email: "u1@x.com" },
    { id: "u2", name: "U2", email: "u2@x.com" },
  ]);
  await db.insert(households).values([
    { id: "h1", name: "H1" },
    { id: "h2", name: "H2" },
    { id: "h3", name: "H3" },
  ]);
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", userId: "u1", email: "u1@x.com", name: "U1", role: "admin" },
    { id: "m2", householdId: "h2", userId: "u1", email: "u1@x.com", name: "U1", role: "member" },
    { id: "m3", householdId: "h3", userId: "u2", email: "u2@x.com", name: "U2", role: "admin" },
    { id: "m4", householdId: "h1", name: "Label only", role: "member" }, // no userId
  ]);
});

describe("isMember", () => {
  it("is true for a user's household and false otherwise", async () => {
    expect(await isMember("u1", "h1")).toBe(true);
    expect(await isMember("u1", "h3")).toBe(false);
  });
});

describe("userHouseholds", () => {
  it("returns only the user's households, ordered by name", async () => {
    const rows = await userHouseholds("u1");
    expect(rows.map((h) => h.id)).toEqual(["h1", "h2"]);
    expect(rows[0]).toMatchObject({ id: "h1", name: "H1", currency: "INR" });
  });
});

describe("assertCanAccessHousehold", () => {
  it("passes for a superadmin on any household", async () => {
    await expect(
      assertCanAccessHousehold({ kind: "superadmin" }, "h3"),
    ).resolves.toBeUndefined();
  });
  it("passes for a member and throws for a non-member", async () => {
    await expect(
      assertCanAccessHousehold({ kind: "user", userId: "u1", email: "u1@x.com" }, "h1"),
    ).resolves.toBeUndefined();
    await expect(
      assertCanAccessHousehold({ kind: "user", userId: "u1", email: "u1@x.com" }, "h3"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/auth/membership.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth/membership'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/membership.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

export async function isMember(
  userId: string,
  householdId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Households the user belongs to (auth membership = userId set), as flat
 *  household rows ordered by name. */
export async function userHouseholds(userId: string) {
  return db
    .select({
      id: households.id,
      name: households.name,
      currency: households.currency,
      createdAt: households.createdAt,
    })
    .from(households)
    .innerJoin(
      householdMembers,
      eq(householdMembers.householdId, households.id),
    )
    .where(eq(householdMembers.userId, userId))
    .orderBy(households.name);
}

/** Throws unless the actor may access the household. Superadmin always may. */
export async function assertCanAccessHousehold(
  actor: Actor,
  householdId: string,
): Promise<void> {
  if (actor.kind === "superadmin") return;
  if (await isMember(actor.userId, householdId)) return;
  throw new Error("Forbidden");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/auth/membership.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/auth/membership.ts src/lib/auth/membership.test.ts
git commit -m "feat(auth): isMember / userHouseholds / assertCanAccessHousehold"
```

---

### Task 6: Make `getCurrentHousehold` + `listHouseholds` actor-aware

**Files:**
- Modify: `src/lib/queries/household-queries.ts:1-34`
- Modify: `src/lib/actions/scoping.test.ts:9-25,68-106` (establish a superadmin actor)
- Test: `src/lib/queries/household-queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/queries/household-queries.test.ts`:

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
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import {
  getCurrentHousehold,
  HOUSEHOLD_COOKIE,
  listHouseholds,
} from "@/lib/queries/household-queries";

const U1 = { kind: "user", userId: "u1", email: "u1@x.com" } as const;
const U2 = { kind: "user", userId: "u2", email: "u2@x.com" } as const;
const SUPER = { kind: "superadmin" } as const;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values([
    { id: "u1", name: "U1", email: "u1@x.com" },
    { id: "u2", name: "U2", email: "u2@x.com" },
  ]);
  await db.insert(households).values([
    { id: "h1", name: "Alpha" },
    { id: "h2", name: "Bravo" },
    { id: "h3", name: "Charlie" },
  ]);
  await db.insert(householdMembers).values([
    { id: "m1", householdId: "h1", userId: "u1", name: "U1", role: "admin" },
    { id: "m2", householdId: "h2", userId: "u1", name: "U1", role: "member" },
    { id: "m3", householdId: "h3", userId: "u2", name: "U2", role: "admin" },
  ]);
});

beforeEach(() => cookieJar.clear());

describe("listHouseholds", () => {
  it("returns all households for a superadmin", async () => {
    actorState.actor = SUPER;
    expect((await listHouseholds()).map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
  });
  it("returns only the user's households", async () => {
    actorState.actor = U1;
    expect((await listHouseholds()).map((h) => h.id)).toEqual(["h1", "h2"]);
  });
  it("returns [] when there is no actor", async () => {
    actorState.actor = null;
    expect(await listHouseholds()).toEqual([]);
  });
});

describe("getCurrentHousehold", () => {
  it("honors the cookie household for a member", async () => {
    actorState.actor = U1;
    cookieJar.set(HOUSEHOLD_COOKIE, "h2");
    expect((await getCurrentHousehold())?.id).toBe("h2");
  });
  it("falls back to the user's first household when the cookie points elsewhere", async () => {
    actorState.actor = U1;
    cookieJar.set(HOUSEHOLD_COOKIE, "h3"); // not a member of h3
    expect((await getCurrentHousehold())?.id).toBe("h1");
  });
  it("falls back to the user's first household with no cookie", async () => {
    actorState.actor = U2;
    expect((await getCurrentHousehold())?.id).toBe("h3");
  });
  it("lets a superadmin resolve any household by cookie", async () => {
    actorState.actor = SUPER;
    cookieJar.set(HOUSEHOLD_COOKIE, "h3");
    expect((await getCurrentHousehold())?.id).toBe("h3");
  });
  it("returns null for a user with no households", async () => {
    actorState.actor = { kind: "user", userId: "nobody", email: "no@x.com" };
    expect(await getCurrentHousehold()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/queries/household-queries.test.ts`
Expected: FAIL — assertions fail because the current `getCurrentHousehold`/`listHouseholds` ignore the actor (e.g. `listHouseholds` for U1 returns all 3, and the no-actor case returns all rather than `[]`).

- [ ] **Step 3: Rewrite the resolvers**

Replace the whole body of `src/lib/queries/household-queries.ts` with:

```ts
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentActor } from "@/lib/auth/actor";
import { isMember, userHouseholds } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";

export const HOUSEHOLD_COOKIE = "he_household";

async function householdById(id: string) {
  const [found] = await db
    .select()
    .from(households)
    .where(eq(households.id, id))
    .limit(1);
  return found ?? null;
}

/**
 * The active household. Superadmin resolves any household (cookie, else the
 * first overall). A user resolves the cookie household only if they are a
 * member, else their first membership, else null. Wrapped in cache() so one
 * request shares a single resolution.
 */
export const getCurrentHousehold = cache(async () => {
  const actor = await getCurrentActor();
  if (!actor) return null;

  const id = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;

  if (actor.kind === "superadmin") {
    if (id) {
      const found = await householdById(id);
      if (found) return found;
    }
    const [first] = await db.select().from(households).limit(1);
    return first ?? null;
  }

  if (id && (await isMember(actor.userId, id))) {
    const found = await householdById(id);
    if (found) return found;
  }
  const mine = await userHouseholds(actor.userId);
  return mine[0] ?? null;
});

export const listHouseholds = cache(async () => {
  const actor = await getCurrentActor();
  if (!actor) return [];
  if (actor.kind === "superadmin") {
    return db.select().from(households).orderBy(households.name);
  }
  return userHouseholds(actor.userId);
});
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm exec vitest run src/lib/queries/household-queries.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Update `scoping.test.ts` to run as a superadmin**

The existing action-scoping tests call `getCurrentHousehold()` indirectly; it now needs an actor. Make those tests run as a superadmin with `hh-a` active (preserves their intent: household-scoped mutations). In `src/lib/actions/scoping.test.ts`:

a) Add a `@/auth` mock alongside the existing mocks (after the `next/cache` mock, around line 25):

```ts
vi.mock("@/auth", () => ({ auth: async () => null }));
```

b) Add `signSession` + `SESSION_COOKIE` to the gate import area (with the other imports, after line 50). Add this import line:

```ts
import { SESSION_COOKIE, signSession } from "@/lib/gate";
```

c) In `beforeAll`, immediately after `cookieJar.set(HOUSEHOLD_COOKIE, "hh-a");` (line 105), add:

```ts
  // Run every scoping test as a superadmin (valid passcode cookie) so
  // getCurrentActor resolves and the active household is the cookie's hh-a.
  cookieJar.set(SESSION_COOKIE, await signSession());
```

- [ ] **Step 6: Run the full suite to verify everything is green**

Run: `pnpm test`
Expected: PASS — all files, including `scoping.test.ts` (now superadmin) and the new scoping test.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/queries/household-queries.ts src/lib/queries/household-queries.test.ts src/lib/actions/scoping.test.ts
git commit -m "feat(authz): scope getCurrentHousehold + listHouseholds to the actor"
```

---

### Task 7: Membership guards on `switchHousehold` / `renameHousehold` + creator membership on `createHousehold`

**Files:**
- Modify: `src/lib/actions/household-actions.ts:45-103`
- Test: `src/lib/actions/household-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/actions/household-actions.test.ts`:

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
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  createHousehold,
  renameHousehold,
  switchHousehold,
} from "@/lib/actions/household-actions";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const U1 = { kind: "user", userId: "u1", email: "u1@x.com" } as const;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "U1", email: "u1@x.com" });
  await db.insert(households).values([
    { id: "h1", name: "Mine" },
    { id: "h2", name: "Theirs" },
  ]);
  await db.insert(householdMembers).values({
    id: "m1", householdId: "h1", userId: "u1", name: "U1", role: "admin",
  });
});

beforeEach(() => {
  cookieJar.clear();
  actorState.actor = U1;
});

describe("switchHousehold", () => {
  it("switches into a household the user belongs to", async () => {
    const result = await switchHousehold("h1");
    expect(result).toEqual({ success: true });
    expect(cookieJar.get(HOUSEHOLD_COOKIE)).toBe("h1");
  });
  it("refuses a household the user does not belong to (no existence leak)", async () => {
    const result = await switchHousehold("h2");
    expect(result).toEqual({ error: "Household not found" });
    expect(cookieJar.get(HOUSEHOLD_COOKIE)).toBeUndefined();
  });
});

describe("renameHousehold", () => {
  it("renames a household the user belongs to", async () => {
    const result = await renameHousehold("h1", form({ name: "Renamed" }));
    expect(result).toEqual({ success: true });
    const [row] = await db.select().from(households).where(eq(households.id, "h1"));
    expect(row.name).toBe("Renamed");
  });
  it("refuses to rename a household the user does not belong to", async () => {
    const result = await renameHousehold("h2", form({ name: "Hijacked" }));
    expect(result).toEqual({ error: "Household not found" });
    const [row] = await db.select().from(households).where(eq(households.id, "h2"));
    expect(row.name).toBe("Theirs");
  });
});

describe("createHousehold", () => {
  it("makes the creating user an admin member of the new household", async () => {
    const result = await createHousehold(form({ name: "Fresh", currency: "INR" }));
    expect(result).toEqual({ success: true });
    const [hh] = await db.select().from(households).where(eq(households.name, "Fresh"));
    const members = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, hh.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: "u1", email: "u1@x.com", role: "admin" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/actions/household-actions.test.ts`
Expected: FAIL — `switchHousehold("h2")` currently succeeds (no membership check), and `createHousehold` inserts a `userId`-less "Me" member, so `members[0].userId` is null.

- [ ] **Step 3: Update the three actions**

In `src/lib/actions/household-actions.ts`, add the actor import (with the other `@/lib/...` imports near the top):

```ts
import { getCurrentActor } from "@/lib/auth/actor";
import { isMember } from "@/lib/auth/membership";
```

Replace `switchHousehold` (lines 45-59) with:

```ts
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
```

In `createHousehold` (lines 61-103), replace the `householdMembers` insert inside the `db.batch([...])` with a creator-aware member. First, just before `const householdId = createId();`, add:

```ts
    const actor = await getCurrentActor();
    if (!actor) return { error: "Not authenticated" };
```

Then replace the member insert:

```ts
      db.insert(householdMembers).values({
        id: createId(),
        householdId,
        name: "Me",
        role: "admin",
      }),
```

with:

```ts
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
```

Replace `renameHousehold` (lines 105-121) with:

```ts
export const renameHousehold = safeAction(
  "renameHousehold",
  async (id: string, formData: FormData) => {
    const parsed = householdSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const actor = await getCurrentActor();
    if (!actor || (actor.kind === "user" && !(await isMember(actor.userId, id)))) {
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
```

> **Note on `deleteHousehold`:** it already gates on `listHouseholds()`, which is now actor-scoped (Task 6), so a non-member's id is absent from `all` and returns "Household not found" without any edit. No change needed.

- [ ] **Step 4: Run the new test to verify it passes**

Run: `pnpm exec vitest run src/lib/actions/household-actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite (scoping.test.ts still green as superadmin)**

Run: `pnpm test`
Expected: PASS — all files.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/actions/household-actions.ts src/lib/actions/household-actions.test.ts
git commit -m "feat(authz): membership guards on switch/rename + creator membership on create"
```

---

## Milestone 3 — Session cut & route split

### Task 8: Bump `SESSION_VERSION` to invalidate outstanding passcode cookies

**Files:**
- Modify: `src/lib/gate.ts:14`
- Test: `src/lib/gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});

import { signSession, verifySession } from "@/lib/gate";

describe("SESSION_VERSION cut", () => {
  it("accepts a freshly signed (v2) token", async () => {
    expect(await verifySession(await signSession())).toBe(true);
  });

  it("rejects a token minted under the old v1 version", async () => {
    // A v1-prefixed token with any signature must fail the version check.
    const stale = "v1.1700000000.deadbeef";
    expect(await verifySession(stale)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/gate.test.ts`
Expected: FAIL on the second test — while `SESSION_VERSION` is still `"v1"`, the stale token's failure is due to the signature, but the intent (version cut) isn't enforced. After the bump the token fails on the version check. (If both pass before the change, that's fine — the bump is what guarantees the cut going forward; proceed to Step 3 to make the version explicit.)

- [ ] **Step 3: Bump the version**

In `src/lib/gate.ts:14`, change:

```ts
const SESSION_VERSION = "v1";
```

to:

```ts
// v2: cut at the Model B deploy so every passcode cookie issued under the old
// shared-access model is invalidated (a stale cookie must NOT become superadmin).
const SESSION_VERSION = "v2";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/gate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the auth-actions test (signs + verifies under v2)**

Run: `pnpm exec vitest run src/lib/actions/auth-actions.test.ts`
Expected: PASS — it signs via `verifyPasscode` and checks `verifySession`, both now v2.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/gate.ts src/lib/gate.test.ts
git commit -m "feat(auth): bump SESSION_VERSION v1->v2 to invalidate stale passcode cookies"
```

---

### Task 9: Route split — `/admin` passcode, `/login` Google-only, proxy matcher

**Files:**
- Create: `src/app/(auth)/admin/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx:1-84`
- Modify: `src/proxy.ts:19`
- Test: `src/proxy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/proxy.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});
// proxy.ts imports @/auth; keep the test hermetic.
vi.mock("@/auth", () => ({ auth: (fn: unknown) => fn }));

import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("excludes /admin so the passcode login is reachable unauthenticated", () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain("admin");
    // The negative-lookahead alternation must list admin alongside login.
    expect(pattern).toMatch(/login\|admin|admin\|login/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/proxy.test.ts`
Expected: FAIL — the current matcher is `"/((?!login|api/auth|~offline|_next|.*\\..*).*)"` (no `admin`).

- [ ] **Step 3: Update the proxy matcher**

In `src/proxy.ts:19`, change the matcher to add `admin`:

```ts
  matcher: ["/((?!login|admin|api/auth|~offline|_next|.*\\..*).*)"],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/proxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the `/admin` passcode page**

Create `src/app/(auth)/admin/page.tsx`:

```tsx
import { ShieldCheck } from "lucide-react";
import { PasscodeForm } from "@/components/auth/passcode-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin access" };

export default function AdminPage() {
  return (
    <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <ShieldCheck className="h-8 w-8" />
          </div>
        </div>
        <div>
          <CardTitle className="font-display text-2xl">Admin access</CardTitle>
          <CardDescription className="mt-2">
            Enter the passcode to manage every household
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <PasscodeForm />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Make `/login` Google-only**

Replace `src/app/(auth)/login/page.tsx` with the Google-only version (drop `PasscodeForm`, the divider, and the unused import):

```tsx
import { Home } from "lucide-react";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Home className="h-8 w-8" />
          </div>
        </div>
        <div>
          <CardTitle className="font-display text-2xl">
            Welcome to Outlay
          </CardTitle>
          <CardDescription className="mt-2">
            Track your household spending together
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button
            type="submit"
            variant="outline"
            className="h-12 w-full gap-3 rounded-xl text-base"
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Verify build + typecheck**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: clean build; `/admin` and `/login` both compile.

- [ ] **Step 8: Commit**

```bash
pnpm exec biome check --write .
git add src/app/\(auth\)/admin/page.tsx src/app/\(auth\)/login/page.tsx src/proxy.ts src/proxy.test.ts
git commit -m "feat(auth): split routes — /admin passcode (superadmin), /login Google-only"
```

---

## Milestone 4 — Invitations

### Task 10: Invite-by-email action + validator

**Files:**
- Create: `src/lib/validators/invite-schema.ts`
- Create: `src/lib/actions/invite-actions.ts`
- Test: `src/lib/actions/invite-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/actions/invite-actions.test.ts`:

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
vi.mock("@/lib/auth/actor", () => ({ getCurrentActor: async () => actorState.actor }));

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { inviteToHousehold } from "@/lib/actions/invite-actions";
import { db } from "@/lib/db";
import { householdMembers, households, users } from "@/lib/db/schema";
import { HOUSEHOLD_COOKIE } from "@/lib/queries/household-queries";

const ADMIN = { kind: "user", userId: "u1", email: "admin@x.com" } as const;

function form(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(users).values({ id: "u1", name: "Admin", email: "admin@x.com" });
  await db.insert(households).values({ id: "h1", name: "Home" });
  await db.insert(householdMembers).values({
    id: "m1", householdId: "h1", userId: "u1", email: "admin@x.com", name: "Admin", role: "admin",
  });
});

beforeEach(() => {
  cookieJar.clear();
  cookieJar.set(HOUSEHOLD_COOKIE, "h1");
  actorState.actor = ADMIN;
});

describe("inviteToHousehold", () => {
  it("creates a pending invite row for a valid email", async () => {
    const result = await inviteToHousehold(form("Invitee@Example.com"));
    expect(result).toEqual({ success: true });
    const [row] = await db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, "h1"), eq(householdMembers.email, "invitee@example.com")));
    expect(row.userId).toBeNull();
    expect(row.role).toBe("member");
  });

  it("rejects an invalid email", async () => {
    const result = await inviteToHousehold(form("not-an-email"));
    expect(result.error).toBeTruthy();
  });

  it("rejects a duplicate invite", async () => {
    await inviteToHousehold(form("dupe@example.com"));
    const result = await inviteToHousehold(form("dupe@example.com"));
    expect(result.error).toMatch(/already/i);
  });

  it("rejects a non-admin member", async () => {
    actorState.actor = { kind: "user", userId: "u2", email: "member@x.com" };
    const result = await inviteToHousehold(form("x@example.com"));
    expect(result.error).toMatch(/admin/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/actions/invite-actions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/actions/invite-actions'`.

- [ ] **Step 3: Write the validator**

Create `src/lib/validators/invite-schema.ts`:

```ts
import { z } from "zod/v4";

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type InviteFormData = z.infer<typeof inviteSchema>;
```

- [ ] **Step 4: Write the action**

Create `src/lib/actions/invite-actions.ts`:

```ts
"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers } from "@/lib/db/schema";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { inviteSchema } from "@/lib/validators/invite-schema";
import { safeAction } from "./safe-action";

export const inviteToHousehold = safeAction(
  "inviteToHousehold",
  async (formData: FormData) => {
    const parsed = inviteSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const email = parsed.data.email.trim().toLowerCase();

    const actor = await getCurrentActor();
    if (!actor) return { error: "Not authenticated" };
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    // Only a superadmin or an admin member of THIS household may invite.
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
      if (!me || me.role !== "admin") {
        return { error: "Only an admin can invite members" };
      }
    }

    const [dup] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, household.id),
          eq(householdMembers.email, email),
        ),
      )
      .limit(1);
    if (dup) return { error: "That email is already invited" };

    await db.insert(householdMembers).values({
      id: createId(),
      householdId: household.id,
      email,
      name: email.split("@")[0],
      role: "member",
    });

    revalidatePath("/members");
    return { success: true };
  },
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/actions/invite-actions.test.ts`
Expected: PASS (4 tests).

> Revoking access reuses the existing `deleteMember` action (it deletes the
> membership row, with the "member has expenses" guard). No new revoke action.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add src/lib/validators/invite-schema.ts src/lib/actions/invite-actions.ts src/lib/actions/invite-actions.test.ts
git commit -m "feat(invites): inviteToHousehold action (admin/superadmin, dedup)"
```

---

## Milestone 5 — UI: onboarding, header, members invite

### Task 11: Header superadmin label + layout actor wiring + first-household onboarding

**Files:**
- Modify: `src/components/layout/header.tsx:44-108`
- Modify: `src/app/(app)/layout.tsx:1-51`
- Create: `src/components/onboarding/first-household.tsx`

- [ ] **Step 1: Add the `isSuperadmin` prop to `Header`**

In `src/components/layout/header.tsx`, extend the props and the dropdown label. Change the `Header` signature (line 44-50):

```tsx
export function Header({
  user,
  householdName,
  isSuperadmin = false,
}: {
  user: HeaderUser | null;
  householdName?: string | null;
  isSuperadmin?: boolean;
}) {
```

Replace the `DropdownMenuLabel` block (lines 99-108) so a passcode actor reads "Superadmin" instead of "Guest":

```tsx
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="font-medium text-sm">
                      {user?.name ?? (isSuperadmin ? "Superadmin" : "Guest")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {user?.email ??
                        (isSuperadmin
                          ? "Signed in with passcode"
                          : "Not signed in")}
                    </p>
                  </div>
                </DropdownMenuLabel>
```

- [ ] **Step 2: Create the onboarding component**

Create `src/components/onboarding/first-household.tsx`:

```tsx
"use client";

import { Home } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHousehold } from "@/lib/actions/household-actions";

export function FirstHousehold() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = await createHousehold(formData);
      if (result?.error) toast.error(result.error);
      // On success createHousehold sets the active-household cookie + revalidates,
      // so the layout re-renders into the full app shell.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
              <Home className="h-8 w-8" />
            </div>
          </div>
          <div>
            <CardTitle className="font-display text-2xl">
              Create your first household
            </CardTitle>
            <CardDescription className="mt-2">
              You're not part of a household yet. Create one, or ask an existing
              member to invite this email.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. My Home"
                required
                className="h-12 rounded-xl text-base"
              />
            </div>
            <input type="hidden" name="currency" value="INR" />
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl text-base"
            >
              {loading ? "Creating…" : "Create household"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire the actor + onboarding into the layout**

Replace `src/app/(app)/layout.tsx` with:

```tsx
import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { PageTransition } from "@/components/motion/page-transition";
import { FirstHousehold } from "@/components/onboarding/first-household";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { HouseholdProvider } from "@/components/providers/household-provider";
import { getCurrentActor } from "@/lib/auth/actor";
import {
  getCurrentHousehold,
  listHouseholds,
} from "@/lib/queries/household-queries";

// These pages read from the database per request, so they must render
// dynamically rather than being statically prerendered at build time (which
// would require a populated database during the build / CI).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [household, householdList, session, actor] = await Promise.all([
    getCurrentHousehold(),
    listHouseholds(),
    auth(),
    getCurrentActor(),
  ]);

  // A signed-in user who belongs to no household sees an onboarding screen
  // instead of the empty app shell. Superadmin always has households.
  if (actor?.kind === "user" && householdList.length === 0) {
    return <FirstHousehold />;
  }

  return (
    <HouseholdProvider
      households={householdList.map((h) => ({ id: h.id, name: h.name }))}
      currentId={household?.id ?? null}
    >
      <CurrencyProvider currency={household?.currency ?? "INR"}>
        <div className="min-h-screen bg-background">
          <Sidebar />
          <div className="md:pl-64">
            <Header
              user={session?.user ?? null}
              householdName={household?.name ?? null}
              isSuperadmin={actor?.kind === "superadmin"}
            />
            <main className="p-4 pb-24 md:p-6 md:pb-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <MobileNav />
        </div>
      </CurrencyProvider>
    </HouseholdProvider>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm exec biome check --write . && pnpm exec tsc --noEmit && pnpm build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/header.tsx src/components/onboarding/first-household.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(ui): superadmin label, actor-aware layout, first-household onboarding"
```

---

### Task 12: Members invite UI + access badges

**Files:**
- Modify: `src/lib/queries/member-queries.ts:13-31`
- Modify: `src/components/members/member-manager.tsx`

- [ ] **Step 1: Return access fields from `getMembersWithStats`**

In `src/lib/queries/member-queries.ts`, add `email` and `userId` to the `getMembersWithStats` select (inside the `.select({...})`, after `avatar`):

```ts
      email: householdMembers.email,
      userId: householdMembers.userId,
```

- [ ] **Step 2: Add the invite form + access badge to `MemberManager`**

In `src/components/members/member-manager.tsx`:

a) Extend the `MemberItem` interface (lines 36-43) to carry the access fields:

```ts
interface MemberItem {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  email: string | null;
  userId: string | null;
  expenseCount: number;
  totalSpent: number;
}
```

b) Add the invite action import to the existing member-actions import (line 30-34):

```ts
import {
  createMember,
  deleteMember,
  updateMember,
} from "@/lib/actions/member-actions";
import { inviteToHousehold } from "@/lib/actions/invite-actions";
```

c) Add invite state + handler inside the component, after the `loading` state (line 50):

```ts
  const [inviting, setInviting] = useState(false);

  async function handleInvite(formData: FormData) {
    setInviting(true);
    try {
      const result = await inviteToHousehold(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation added");
    } finally {
      setInviting(false);
    }
  }
```

d) Add an `accessBadge` helper above the `return` (after `handleDelete`):

```ts
  function accessBadge(member: MemberItem) {
    if (member.userId) return { label: "Has access", variant: "default" as const };
    if (member.email) return { label: "Invited", variant: "secondary" as const };
    return null;
  }
```

e) Render an invite form at the very top of the returned fragment, immediately after the opening `<>` (before the `members.length === 0` check):

```tsx
      <form
        action={handleInvite}
        className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card sm:flex-row"
      >
        <Input
          type="email"
          name="email"
          placeholder="Invite by email"
          required
          aria-label="Invite member by email"
          className="h-11 flex-1 rounded-xl"
        />
        <Button
          type="submit"
          disabled={inviting}
          className="h-11 rounded-xl"
        >
          {inviting ? "Inviting…" : "Send invite"}
        </Button>
      </form>
```

f) Show the access badge inside each member card. Replace the role `Badge` block (lines 132-134) with role + access:

```tsx
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {member.role}
                        </Badge>
                        {accessBadge(member) && (
                          <Badge
                            variant={accessBadge(member)?.variant}
                            className="text-xs"
                          >
                            {accessBadge(member)?.label}
                          </Badge>
                        )}
                      </div>
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm exec biome check --write . && pnpm exec tsc --noEmit && pnpm build`
Expected: clean. (`getMembersWithStats` now returns `email`/`userId`, satisfying the widened `MemberItem`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/member-queries.ts src/components/members/member-manager.tsx
git commit -m "feat(invites): members page invite-by-email form + access badges"
```

---

## Milestone 6 — Migration, e2e, docs

### Task 13: Owner backfill migration script

**Files:**
- Create: `scripts/migrate-model-b-owner.ts`
- Modify: `package.json:24` (add `db:migrate:model-b`)
- Test: `src/lib/db/migrate-owner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/migrate-owner.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = ":memory:";
  process.env.AUTH_SECRET ??= "test-secret";
});

import { and, eq, isNotNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/lib/db";
import { migrateOwner, OWNER_EMAIL } from "@/lib/db/migrate-owner";
import { householdMembers, households, users } from "@/lib/db/schema";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(households).values([
    { id: "h1", name: "Existing One" },
    { id: "h2", name: "Existing Two" },
  ]);
});

describe("migrateOwner", () => {
  it("creates the owner and an admin membership per household, idempotently", async () => {
    await migrateOwner();

    const owners = await db.select().from(users).where(eq(users.email, OWNER_EMAIL));
    expect(owners).toHaveLength(1);

    const memberships = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, owners[0].id),
          isNotNull(householdMembers.userId),
        ),
      );
    expect(memberships).toHaveLength(2);
    expect(memberships.every((m) => m.role === "admin")).toBe(true);

    // Re-run must not duplicate.
    await migrateOwner();
    const after = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, owners[0].id));
    expect(after).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/db/migrate-owner.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/migrate-owner'`.

- [ ] **Step 3: Write the migration module**

Create `src/lib/db/migrate-owner.ts`:

```ts
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNotNull } from "drizzle-orm";
import { upsertUserByEmail } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

export const OWNER_EMAIL = "mangatinanda@gmail.com";
const OWNER_NAME = "Nanda";

/** Idempotent: ensure the owner user exists and is an admin member of every
 *  household that has no auth-membership yet. Safe to re-run. */
export async function migrateOwner(): Promise<void> {
  const ownerId = await upsertUserByEmail({
    email: OWNER_EMAIL,
    name: OWNER_NAME,
  });

  const allHouseholds = await db.select({ id: households.id }).from(households);
  for (const h of allHouseholds) {
    const [hasAuthMember] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, h.id),
          isNotNull(householdMembers.userId),
        ),
      )
      .limit(1);
    if (hasAuthMember) continue;

    await db.insert(householdMembers).values({
      id: createId(),
      householdId: h.id,
      userId: ownerId,
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      role: "admin",
    });
  }
}
```

- [ ] **Step 4: Write the runnable script**

Create `scripts/migrate-model-b-owner.ts`:

```ts
import { migrateOwner } from "../src/lib/db/migrate-owner";

migrateOwner()
  .then(() => {
    console.log("Model B owner backfill complete.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 5: Add the package script**

In `package.json`, add to `"scripts"` (after the `db:e2e:reset` line):

```json
    "db:migrate:model-b": "tsx scripts/migrate-model-b-owner.ts"
```

(Add a trailing comma to the preceding line as needed so the JSON stays valid.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/db/migrate-owner.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write . && pnpm exec tsc --noEmit
git add scripts/migrate-model-b-owner.ts src/lib/db/migrate-owner.ts src/lib/db/migrate-owner.test.ts package.json
git commit -m "feat(migrate): idempotent Model B owner backfill (mangatinanda@gmail.com)"
```

---

### Task 14: Update e2e to log in via `/admin` (superadmin)

**Files:**
- Modify: `e2e/login.spec.ts:18-30`
- Modify: `e2e/switch-household-isolation.spec.ts:24-29`

- [ ] **Step 1: Update the login smoke test**

Replace the body of the test in `e2e/login.spec.ts` (the `page.goto`/assertions, lines 18-29) so it unlocks at `/admin`:

```ts
  await page.goto("/admin");

  await expect(page.getByText("Admin access")).toBeVisible();

  await page.getByPlaceholder("Enter household passcode").fill("e2e-pass");
  await page.getByRole("button", { name: "Unlock" }).click();

  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
```

Also update the doc comment at the top of the file to say the passcode path is the **superadmin** path at `/admin` (the comment about "Welcome to Outlay" CardTitle now refers to `/login`, which the suite no longer exercises; mention `/admin`'s "Admin access" title instead).

- [ ] **Step 2: Update the isolation spec's login helper**

In `e2e/switch-household-isolation.spec.ts`, change the `login` helper (line 24-29) to go to `/admin`:

```ts
async function login(page: Page) {
  await page.goto("/admin");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");
}
```

(The superadmin sees all households via `listHouseholds`, so House A + House B still appear and the switch-isolation assertions hold unchanged.)

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS — both specs (the webServer resets/seeds `data/e2e.db`, builds, and starts; login now unlocks at `/admin`). If running locally without browsers installed, first run `pnpm exec playwright install --with-deps chromium`.

- [ ] **Step 4: Commit**

```bash
git add e2e/login.spec.ts e2e/switch-household-isolation.spec.ts
git commit -m "test(e2e): unlock via /admin (superadmin) after route split"
```

---

### Task 15: Update project docs

**Files:**
- Modify: `CLAUDE.md` (Auth Status + Auth bullet)
- Modify: `src/CLAUDE.md` (Household Context)
- Modify: `memory.md` (Work log + Current state)

- [ ] **Step 1: Update `CLAUDE.md`**

In `CLAUDE.md`, replace the `**Auth**` bullet under Tech Stack and the `## Auth Status` section to describe Model B: Google users are scoped to their `household_members` memberships; the passcode is now an explicit **superadmin** at `/admin` (bypasses scoping); invites are email rows claimed on login; `SESSION_VERSION` is `v2`. Note `getCurrentActor()` (`src/lib/auth/actor.ts`) as the principal resolver and `assertCanAccessHousehold` / `isMember` (`src/lib/auth/membership.ts`) as the guards. Mark Model B as **implemented** (superseding `plans/2026-06-09-google-login.md` §8).

- [ ] **Step 2: Update `src/CLAUDE.md`**

In the `## Household Context` section, replace the "shared workspaces behind the access gate" description: households are now **per-user**, resolved by `getCurrentHousehold()` against the actor's memberships; superadmin (passcode) sees all; `switchHousehold`/`renameHousehold` enforce membership; `createHousehold` adds the creator as an admin member.

- [ ] **Step 3: Update `memory.md`**

Per the repo-memory skill: add a dated `## Work log` entry (2026-06-16) summarizing Model B — the authorization fix, superadmin passcode at `/admin`, invite-by-email, owner backfill, `SESSION_VERSION` v2 cut, and the rollout order. Update **Current state & open items**: Model B implemented; open external steps = run `pnpm db:migrate` + `pnpm db:migrate:model-b` against prod Turso after deploy, owner re-unlocks `/admin`, family signs in with Google and gets invited. Record the **key decision**: passcode repurposed as superadmin rather than retired, with the `SESSION_VERSION` bump as the deploy-safety mechanism.

- [ ] **Step 4: Final full verification**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm exec biome check . && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/CLAUDE.md memory.md
git commit -m "docs: Model B — per-user households + superadmin passcode (auth model update)"
```

---

## Post-implementation (operator steps — not code)

After the branch merges and Vercel deploys:
1. `pnpm db:migrate` against prod (applies `0003_*` — email column + indexes).
2. `pnpm db:migrate:model-b` against prod (owner backfill for `mangatinanda@gmail.com`).
3. The `SESSION_VERSION` cut logs out all existing passcode sessions; the owner re-unlocks once at `/admin`.
4. Family members sign in with Google (scoped, allow-listed); the owner invites them to the shared household(s) from `/members`.

---

## Self-Review

**Spec coverage:** §4 principal model → Task 4. §5 schema → Task 1. §6 identity/session → Tasks 2–3. §7 authz core → Tasks 5–7. §8 route split + SESSION_VERSION → Tasks 8–9. §9 invitations → Tasks 10, 12. §10 onboarding → Task 11. §11 migration → Task 13. §12 header/sign-out → Task 11 (sign-out already dual-path, unchanged). §13 testing → integration tests throughout; e2e → Task 14. §15 file list → all files covered. No gaps.

**Type consistency:** `Actor` (`{kind:'superadmin'} | {kind:'user',userId,email}`) is identical in Tasks 4–7, 10–11. `getCurrentActor`, `isMember(userId, householdId)`, `userHouseholds(userId)`, `assertCanAccessHousehold(actor, householdId)`, `upsertUserByEmail({email,name?,image?})→id`, `claimInvites(email,userId)`, `canSignIn(email)`, `inviteToHousehold(FormData)`, `migrateOwner()`/`OWNER_EMAIL` are referenced consistently across tasks. `MemberItem` gains `email`/`userId` in Task 12 to match the widened `getMembersWithStats` select.

**Placeholder scan:** No TBD/TODO; every code step has complete code; the one generated artifact (`drizzle/0003_*.sql`) is produced by `pnpm db:generate` in Task 1 Step 4. The `pnpm build` middleware contingency in Task 3 Step 7 is a concrete, conditional mitigation, not a placeholder.
