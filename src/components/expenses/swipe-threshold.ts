/** Horizontal drag distance (px, leftward) past which the delete affordance is committed. */
export const SWIPE_REVEAL_PX = 72;

/**
 * Pure decision: given a horizontal offset (negative = dragged left), should the
 * row commit to revealing/confirming delete? Right drags never reveal.
 */
export function shouldRevealDelete(offsetX: number): boolean {
  return offsetX < -SWIPE_REVEAL_PX;
}
