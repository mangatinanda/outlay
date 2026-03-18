import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";

export async function getDefaultHousehold() {
  const result = await db.select().from(households).limit(1);
  return result[0] ?? null;
}
