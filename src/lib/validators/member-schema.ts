import { z } from "zod/v4";

export const memberSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  role: z.enum(["admin", "member"]),
});

export type MemberFormData = z.infer<typeof memberSchema>;
