/** Copy the resolved userId from the JWT onto the session user. Extracted so
 *  the mapping is unit-testable without booting Auth.js. The generic keeps the
 *  caller's concrete type while widening `user` to expose `.id`; the `any`
 *  constraint is needed because Auth.js's Session.user (User | AdapterUser)
 *  and plain test objects don't share a precise structural type. */
// biome-ignore lint/suspicious/noExplicitAny: accept both Auth.js Session.user and plain test objects
export function applyUserIdToSession<T extends { user?: any }>(
  session: T,
  userId: string | undefined,
): T & { user?: { id?: string } | null } {
  if (userId && session.user) {
    session.user.id = userId;
  }
  return session as T & { user?: { id?: string } | null };
}
