import { z } from "zod/v4";

export const householdSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name is too long"),
});
