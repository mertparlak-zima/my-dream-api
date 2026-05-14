import { z } from 'zod';

export const syncUserSchema = z.object({
  email: z.email(),
  auth_provider: z.enum(['GOOGLE', 'APPLE']),
  provider_id: z.string().min(1),
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
});

export type SyncUserInput = z.infer<typeof syncUserSchema>;
