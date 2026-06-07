import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// One driver for both worlds: a local SQLite file (`file:./data/expense.db`)
// in development, and a Turso/libSQL URL (`libsql://...` + auth token) in production.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/expense.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
