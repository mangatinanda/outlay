import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/lib/env";
import * as schema from "./schema";

// One driver for both worlds: a local SQLite file (`file:./data/expense.db`)
// in development, and a Turso/libSQL URL (`libsql://...` + auth token) in production.
const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
