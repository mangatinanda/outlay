// Module-level store driving the global <TopProgressBar />. There are two
// independent reasons the app may be "waiting on the server":
//   - navInFlight: a route navigation has started but not yet committed
//   - actionCount: N server actions (saves) are currently running
// The bar is shown whenever either is true. This is a tiny hand-rolled store
// (rather than a React context) so any client component — including deeply
// nested forms — can flag a pending save via `withProgress` without prop
// drilling or wrapping the tree in another provider.

type Listener = () => void;

let navInFlight = false;
let actionCount = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Subscribe to active-state changes (for useSyncExternalStore). */
export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a navigation and/or one or more saves are in flight. */
export function isProgressActive(): boolean {
  return navInFlight || actionCount > 0;
}

/** The bar is never active during SSR. */
export function getServerProgressSnapshot(): boolean {
  return false;
}

/** Flag the start/end of a route navigation. */
export function setNavInFlight(value: boolean): void {
  if (navInFlight === value) return;
  navInFlight = value;
  emit();
}

/** Increment the in-flight save counter (a server action started). */
export function startAction(): void {
  actionCount += 1;
  emit();
}

/** Decrement the in-flight save counter (a server action finished). */
export function endAction(): void {
  actionCount = Math.max(0, actionCount - 1);
  emit();
}

/**
 * Run an async server action (or any promise-returning work) while the global
 * loader is shown. The counter is always balanced — even if `fn` throws or the
 * action calls `redirect()` (which rejects with a special error) — so the bar
 * can never get stuck on.
 */
export async function withProgress<T>(fn: () => Promise<T> | T): Promise<T> {
  startAction();
  try {
    return await fn();
  } finally {
    endAction();
  }
}
