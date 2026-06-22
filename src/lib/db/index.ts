import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/lib/env";
import * as schema from "./schema";

// One driver for both worlds: a local SQLite file (`file:./data/expense.db`)
// in development, and a Turso/libSQL URL (`libsql://...` + auth token) in production.
function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

type DB = ReturnType<typeof createDb>;

// `next build` imports this module while collecting page data but runs no
// queries (DB-backed pages are `force-dynamic`). Opening the connection eagerly
// at import meant the build needed a valid DATABASE_URL — which Vercel Preview
// deployments don't have, so they failed with `LibsqlError: URL_INVALID`.
// During the build phase we therefore defer the connection behind a proxy that
// constructs the real client only if something actually queries (it won't).
// At runtime — and in tests — `db` stays the real, eagerly-created client, so
// behavior is unchanged.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function lazyDb(): DB {
  let instance: DB | undefined;
  return new Proxy({} as DB, {
    get(_target, prop) {
      instance ??= createDb();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

export const db: DB = isBuildPhase ? lazyDb() : createDb();
