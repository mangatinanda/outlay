import { unstable_rethrow } from "next/navigation";

/**
 * Wraps a Server Action body so infrastructure failures (e.g. a transient
 * Turso outage) surface as the documented `{ error }` envelope — visible as
 * a toast and in `vercel logs` — instead of an unhandled rejection the client
 * never sees. Next.js control-flow throws (redirect/notFound) pass through.
 */
export function safeAction<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R | { error: string }> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      unstable_rethrow(error);
      console.error(`[action:${name}]`, error);
      return { error: "Something went wrong. Please try again." };
    }
  };
}
