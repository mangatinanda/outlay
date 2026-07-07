# In-app notifications — design

- **Date:** 2026-07-07
- **Status:** Approved (brainstorm) — pending implementation plan
- **Author:** Nanda + Claude

## Goal

Add a per-user, cross-household **in-app notifications module**:

1. **Invite lifecycle** — a logged-in user is notified when invited to another
   household and can **Accept/Decline the invite in-app** (no sign-out/sign-in
   required — today `claimInvites` only runs in the Auth.js `jwt` callback at
   sign-in, `src/auth.ts`). Admins are notified of the outcome.
2. **Money events** — a settlement recorded against your member row, and
   expenses above a per-household threshold added by someone else.
3. A **bell + dropdown** in the header, a **`/notifications`** history page,
   and a ~60s unread-count poll.

The emission layer is a single choke point (`notify()`) so future event types
are one call each, and the v2 follow-up — **Web Push via the existing Serwist
service worker** — slots in without rework.

## Non-goals (v1)

- Web Push / notifications while the app is closed (explicit v2 follow-up).
- Notifying invited emails that have no `users` row yet (nothing to show them
  in-app; their path stays first-sign-in → `claimInvites`).
- Digest/summary notifications (needs scheduled jobs).
- Recording *who* sent an invite (`household_members` gains no `invited_by`;
  outcomes notify all linked admins instead).
- Per-user notification preferences (the only knob is the per-household
  expense threshold).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Invite notification action | **Accept/Decline in-app.** Accept claims the membership immediately (sets `user_id` on the invite row); Decline deletes the pending row. Login-time `claimInvites` remains as fallback. |
| V1 events | **Invite lifecycle** (`invite.received`, `invite.accepted`, `invite.declined`) + **money events** (`settlement.recorded`, `expense.large`). |
| Delivery UX | **Bell + dropdown + `/notifications` page.** Dropdown shows ~10 recent with inline invite actions; page shows history (latest 50). |
| Freshness | **Server-rendered badge + ~60s client poll** of unread count (visibility-aware; list fetched on dropdown open). |
| Expense noise control | **Per-household threshold** `households.notify_expense_over_minor` (admin-set in Settings, null/0 = off). Settlements involving you always notify. |
| Architecture | **Approach A — dedicated `notifications` table, fan-out on write** via a best-effort `notify()` helper (same pattern as `logActivity`). Rejected: derive-at-read (expensive polling, underivable events); Web Push in v1 (scope). |

## Data model

One new table + one new column. One Drizzle migration. Additive only.

```ts
// src/lib/db/schema.ts
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),                    // cuid2
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type", {
      enum: ["invite.received", "invite.accepted", "invite.declined",
             "settlement.recorded", "expense.large"],
    }).notNull(),
    householdId: text("household_id"),              // context only — deliberately NO FK
    payload: text("payload").notNull(),             // JSON snapshot, type-specific
    readAt: integer("read_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
  ],
);

// households gains:
notifyExpenseOverMinor: integer("notify_expense_over_minor"), // null/0 = off
```

- **Denormalized by design, like `activity`.** No FKs except `user_id`. The
  payload snapshots everything needed to render forever: `householdName`,
  actor label, `amountMinor` + `currency` (at emit time), description. A
  notification still renders after its household/expense is renamed or gone.
- **Invite payloads carry `memberId`** (the invite row id) but never invite
  *state*. State is resolved at read time from the live `household_members`
  row: `user_id` null → pending (show Accept/Decline); `user_id` set →
  "Accepted" (covers the login-claim race); row gone → "No longer available".
- **Read ≠ actioned.** `readAt` only drives the badge; an invite stays
  actionable after being marked read.
- **Retention: prune-on-write** — on insert, delete the user's rows beyond the
  newest 100. No cron.

## Emission layer

```ts
// src/lib/notifications.ts
export async function notify(input: {
  userIds: string[];              // deduped; callers exclude the actor
  type: NotificationType;
  householdId?: string;
  payload: Record<string, unknown>;
}): Promise<void>
```

**BEST-EFFORT:** try/catch around everything, failures logged and swallowed — a
notification must never fail the parent mutation (identical posture to
`logActivity`). Called after the mutation succeeds, before `revalidatePath()`.
One multi-row insert + prune per user. This function is the single emission
point where v2 Web Push dispatch will be added.

| Event | Emitting action | Recipients | Payload highlights |
|---|---|---|---|
| `invite.received` | `inviteToHousehold` | Invited email's `users` row, if any | `memberId`, `householdName`, inviter label |
| `invite.accepted` | `acceptInvite` (new) | Household admins with `user_id`, minus accepter | accepter name, `householdName` |
| `invite.declined` | `declineInvite` (new) | Same admins | invited email, `householdName` |
| `settlement.recorded` | `createSettlement` | Counterparty member's `user_id` if linked and ≠ actor | `amountMinor`, `currency`, from/to names |
| `expense.large` | `createExpense` | Members with `user_id` except actor, when `amountMinor ≥ notify_expense_over_minor` (threshold set and > 0) | `amountMinor`, `currency`, description, actor label |

Only `createExpense` emits `expense.large`. Expense **updates** and **CSV
imports** do not emit in v1 (imports would flood the feed; an edit crossing
the threshold is an accepted gap).

## Actions and reads

New Server Actions in `src/lib/actions/notification-actions.ts`, all wrapped in
`safeAction`:

- **`acceptInvite(memberId)`** — the in-app claim:
  `UPDATE household_members SET user_id = :me WHERE id = :memberId AND
  lower(email) = :myEmail AND user_id IS NULL`. Empty `.returning()` →
  `{ error: "Invite no longer available" }`. The email guard means only your
  own invite is claimable (fail-closed, no existence leak). If the
  `(householdId, userId)` unique index rejects the update (already a member),
  catch it, delete the redundant invite row, return success. On success:
  `logActivity`, `notify` admins, `revalidatePath` so the switcher shows the
  household immediately.
- **`declineInvite(memberId)`** — `DELETE` with the same
  `email`/`user_id IS NULL` guards; notifies admins.
- **`markAllNotificationsRead()`** — one `UPDATE ... SET read_at = now WHERE
  user_id = :me AND read_at IS NULL`, fired on dropdown open.

Reads in `src/lib/queries/notification-queries.ts`: `getUnreadCount()` and
`listNotifications(limit)` — resolve the actor internally; superadmin (no
`userId`) gets 0/empty. The list left-joins `household_members` on the
payload's `memberId` to compute live invite state.

**Poll endpoint:** GET `/api/notifications/count` — a deliberate, documented
exception to the "no API routes" convention. Polling is a read; a Server
Action would be a POST per minute per tab. The handler is ~3 lines:
`getCurrentActor()` → `{ count }`. Client poll pauses when
`document.visibilityState === "hidden"`. Navigation refreshes the badge
server-side for free (the `(app)` layout is `force-dynamic`).

## UI

- **`NotificationBell`** (`src/components/notifications/notification-bell.tsx`,
  client) in the header between theme toggle and avatar; rendered only for
  user actors. Lucide `Bell`, unread badge capped at `9+`, initial count
  server-rendered via layout props, then the 60s poll.
- **Dropdown** (existing `DropdownMenu` family, ~`w-80`, internal scroll):
  opening fetches ~10 recent items and fires `markAllNotificationsRead()`
  with optimistic badge clear. Items: type icon, one-line summary, household
  name + relative time (date-fns), amounts formatted from payload snapshot
  (`tabular-nums`). Invite items show inline **Accept**/**Decline** (pending
  spinner, `toast` result; Accept triggers `router.refresh()`). Resolved
  invites render muted state text, no buttons. Footer: "View all" →
  `/notifications`.
- **`/notifications` page** — Server Component in `(app)`: `PageHeader`,
  latest 50 via shared `NotificationItem`, `EmptyState`, `loading.tsx`
  skeleton. Works with zero households (first-invite case).
- **Settings**: admin-only field in the household settings card — "Notify
  members about expenses over ___" (major units in the form, stored via
  `toMinorUnits()`, empty = off). The saving action enforces the admin role
  server-side (same check as `inviteToHousehold`), not just in the UI.
- **Design system** per `.claude/rules/ui.md`: semantic tokens only,
  `rounded-2xl`/`shadow-card`, 44px touch targets on Accept/Decline, shared
  `src/components/motion/` primitives (no-op under reduced motion), AA
  contrast in both themes.

## Error handling & edge cases

- `notify()` never throws; poll failures are silent (badge self-corrects on
  next poll/navigation); all actions return `{ error }` via `safeAction`.

| Case | Behavior |
|---|---|
| Invite claimed via re-login while notification unread | Renders "Accepted" (live join); buttons never shown |
| Invite revoked/declined elsewhere | "No longer available" |
| Accept when already a member (unique-index conflict) | Redundant invite row deleted; treated as success |
| Foreign `memberId` passed to accept/decline | Email guard → `{ error }`, no existence leak |
| Household deleted after notification sent | Renders from payload snapshot; invite resolves "No longer available" |
| Superadmin | No bell, empty queries, emitters skip (no `userId`) |
| Threshold changed later | Future expenses only; history never rewritten |
| >100 notifications per user | Oldest pruned on write |

## Testing

Vitest integration tests (real Server Actions against in-memory libSQL with
real migrations — the established pattern):

- **Emitters:** invite to an existing email → exactly one notification;
  unknown email → none; settlement notifies only the linked counterparty;
  expense respects threshold off/on/boundary; actor never self-notifies.
- **Accept/decline:** accept sets `user_id` + notifies admins; wrong-email
  claim fails; double-accept idempotent; already-member conflict path.
- **Reads:** unread count; `markAllNotificationsRead`; prune-at-100;
  superadmin gets nothing.
- **Playwright:** e2e auth is the passcode (= superadmin), which hides the
  bell — e2e asserts only the bell's absence for superadmin; user flows are
  covered by integration tests.

## Future (v2): Web Push

`notify()` is the single emission point. V2 adds: a `push_subscriptions`
table (per user+device endpoint), VAPID keys in env, a permission/subscribe
UI, and a push dispatch inside `notify()` via the existing Serwist service
worker. No v1 code changes anticipated beyond extending `notify()`.
