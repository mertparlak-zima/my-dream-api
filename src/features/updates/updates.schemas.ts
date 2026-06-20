import { z } from 'zod';

export const updatesQuerySchema = z.object({
  lang: z.enum(['tr', 'en']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
