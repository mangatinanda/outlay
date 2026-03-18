import { z } from "zod/v4";

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  icon: z.string().min(1, "Icon is required"),
  color: z.string().min(1, "Color is required"),
});

export type CategoryFormData = z.infer<typeof categorySchema>;
