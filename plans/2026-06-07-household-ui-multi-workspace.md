# Plan — Multi-Household UI (shared "workspaces")

**Date:** 2026-06-07
**Status:** Approved design — ready to implement
**Type:** Feature

---

## 1. Goal

Turn the single-household app into **multiple households the user can create, rename, delete,
and switch between** — each isolating its own expenses, members, categories, and currency.
All households sit **behind the existing single passcode** (workspace model, like
Slack/Notion workspaces). Per-user ownership and permissions are **out of scope** — they wait
for the real-auth milestone.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Capability | Create / list / switch / rename / delete households; per-household data isolation. |
| Access | **Single shared passcode, unchanged.** Anyone who unlocks can switch between all households. No per-household or per-user auth now. |
| "Current household" | A plain `he_household` cookie holding the active household id (validated server-side; **not** a security boundary, so unsigned). |
| New household | Seeded with the 12 default categories + a default "Me" admin member, so it's usable immediately. |
| Switcher UI | Workspace switcher at the **top of the sidebar** + a dedicated `/households` management page. |
| Deferred | Per-user ownership, permissions, invitations, per-household passcodes → real-auth milestone. |

## 3. The linchpin: "current household"

Today every read/write resolves the household through **one** function,
`getDefaultHousehold()` (returns the first row) — **12 call sites** across 8 pages and 4
actions. The entire feature pivots on replacing that with a cookie-aware resolver:

```ts
// lib/queries/household-queries.ts
export async function getCurrentHousehold() {
  const id = (await cookies()).get("he_household")?.value;
  if (id) {
    const found = await db.select().from(households).where(eq(households.id, id)).limit(1);
    if (found[0]) return found[0];           // active household
  }
  const first = await db.select().from(households).limit(1);
  return first[0] ?? null;                    // fallback (no/invalid cookie)
}
export async function listHouseholds() {
  return db.select().from(households).orderBy(households.name);
}
```

> **Completeness technique:** *remove* the exported `getDefaultHousehold` and rename to
> `getCurrentHousehold`. Every one of the 12 call sites then fails to compile until updated —
> the type-checker guarantees we miss none (a missed site would leak data across households).
> Pages are already `force-dynamic`, so reading the cookie adds no rendering constraint.

## 4. Data flow

```mermaid
flowchart LR
    SW["Household switcher<br/>(sidebar)"] -->|switchHousehold(id)| C["he_household cookie"]
    MP["/households page"] -->|create/rename/delete| DB[(households + children)]
    C --> GCH["getCurrentHousehold()"]
    GCH --> Q["all queries/actions<br/>(12 sites)"]
    Q --> DB
    GCH --> CP["CurrencyProvider<br/>(per-household currency)"]
```

Because all data is already scoped by `household_id`, once `getCurrentHousehold()` returns the
active household, every view (dashboard, expenses, members, categories, currency) isolates
automatically.

## 5. File-by-File Changes

### New files
| File | Purpose |
|---|---|
| `src/lib/actions/household-actions.ts` | `createHousehold`, `renameHousehold`, `deleteHousehold`, `switchHousehold`. |
| `src/lib/validators/household-schema.ts` | Zod: household `name` (1–50). |
| `src/lib/db/default-categories.ts` | Extracted `DEFAULT_CATEGORIES` (shared by `seed.ts` and `createHousehold`). |
| `src/components/layout/household-switcher.tsx` | `"use client"` — sidebar workspace switcher (DropdownMenu): current household, switch list, "New household", "Manage households". |
| `src/components/households/household-manager.tsx` | `"use client"` — list/create/rename/delete UI (mirrors `member-manager` pattern). |
| `src/app/(app)/households/page.tsx` | Households management page (Server Component → manager). |

### Modified files
| File | Change |
|---|---|
| `src/lib/queries/household-queries.ts` | Replace `getDefaultHousehold` → `getCurrentHousehold` (cookie-aware) + add `listHouseholds`. |
| **12 call sites** (8 pages + `member/expense/category/settings`-actions) | `getDefaultHousehold()` → `getCurrentHousehold()`. |
| `src/lib/db/seed.ts` | Import `DEFAULT_CATEGORIES` from the extracted module (no behavior change). |
| `src/components/layout/sidebar.tsx` | Add `<HouseholdSwitcher>` at top + a "Households" nav item. |
| `src/components/layout/mobile-nav.tsx` | (Optional) surface household switch — likely via Settings/switcher rather than a 6th tab (keep mobile bar at 5). |
| `src/lib/constants.ts` | Remove the now-unused `HOUSEHOLD_ID` constant. |

## 6. Key flows

**Switch:** `switchHousehold(id)` → validate the id exists → set `he_household` cookie →
`revalidatePath("/", "layout")` so every view re-renders for the new household.

**Create:** `createHousehold({ name, currency })` → insert household (cuid2 id) → seed the 12
default categories + a "Me" admin member → set `he_household` to the new id → revalidate.
(New household has no expenses → empty dashboard, ready to use.)

**Rename:** `renameHousehold(id, name)` → validate → update → revalidate.

**Delete:** `deleteHousehold(id)` →
- **Guard:** block if it is the only household (`listHouseholds().length === 1` → `{error}`).
- Delete children in FK order (expenses → categories + members) then the household, in a
  transaction.
- If the deleted household was current, switch the cookie to another remaining household.
- Confirm via the existing `ConfirmDialog`; revalidate.

> Currency: the currency switcher already targets "the current household" once
> `getCurrentHousehold` is in place — currency becomes per-household for free. (Per-household
> default stays INR via the schema default.)

## 7. Implementation Steps (each with a verification gate)

1. **Resolver** — add `getCurrentHousehold` + `listHouseholds`; remove `getDefaultHousehold`.
   → verify: `tsc` lists exactly the 12 call sites as errors.
2. **Thread it** — update all 12 call sites to `getCurrentHousehold()`.
   → verify: `tsc` clean.
3. **Extract** `DEFAULT_CATEGORIES`; point `seed.ts` at it. → verify: `pnpm db:init` still seeds.
4. **Actions** — `household-actions.ts` + `household-schema.ts` (create/rename/delete/switch).
   → verify: `tsc` clean.
5. **Switcher** — `household-switcher.tsx` in the sidebar. → verify: switch changes active household.
6. **Management page** — `/households` + `household-manager.tsx` + sidebar nav link.
   → verify: create/rename/delete round-trips.
7. **Full verification** — create a 2nd household → switch → confirm **empty, isolated** data →
   add an expense → switch back → original data intact → delete guard works → currency is
   per-household. `tsc` + lint + `build` + runtime smoke.

## 8. Acceptance Criteria

- A sidebar switcher lists all households, shows the active one, and switches via cookie.
- `/households` can create (seeded + usable), rename, and delete households (last-household
  delete is blocked; deleting the active one reassigns current).
- Switching households fully isolates dashboard/expenses/members/categories/currency.
- No data leaks across households (all 12 resolution sites use `getCurrentHousehold`).
- Single passcode unchanged; `tsc` + lint + `build` clean.

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A missed resolution site leaks data across households | Remove the old export so the type-checker flags all 12 sites. |
| Cookie points at a deleted household | `getCurrentHousehold` validates existence → falls back to first. |
| Deleting the current/last household | Reassign current on delete; block deleting the last one. |
| FK violations on delete | Delete children (expenses → categories/members) before the household, in a transaction. |
| Mobile nav crowding | Keep the 5-tab mobile bar; expose switching via the switcher/Settings. |

## 10. Out of Scope (deferred to real-auth milestone)

- Per-user accounts, household ownership, and permissions.
- Inviting people to a household; per-household passcodes.
- Cross-household reporting or moving expenses between households.

## 11. Open question (non-blocking)

- **Delete semantics:** cascade-delete a household *with* its expenses (current plan, behind a
  confirm), **or** block deletion until it's emptied? Default: cascade behind a clear confirm
  dialog. Flag if you'd prefer block-until-empty.
