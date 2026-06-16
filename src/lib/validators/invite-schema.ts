import { z } from "zod/v4";

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type InviteFormData = z.infer<typeof inviteSchema>;
