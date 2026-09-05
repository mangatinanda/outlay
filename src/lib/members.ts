/**
 * Members offered as a payer. Hidden members (`showInPaidBy` off) are dropped,
 * except the one already attributed to the expense being edited — editing an
 * old expense must never silently reassign it.
 */
export function visiblePayers<T extends { id: string; showInPaidBy: boolean }>(
  members: readonly T[],
  keepId?: string | null,
): T[] {
  return members.filter((m) => m.showInPaidBy || m.id === keepId);
}
