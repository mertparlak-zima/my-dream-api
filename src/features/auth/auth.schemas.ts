import { z } from 'zod';

/**
 * Apple only returns the user's name on the very first authorization, so the app
 * calls this once when the name fields are still empty. Identity (email,
 * provider, account) is owned by Better Auth; only profile name is accepted here.
 */
export const bootstrapProfileSchema = z.object({
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
});

export type BootstrapProfileInput = z.infer<typeof bootstrapProfileSchema>;
