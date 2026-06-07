import { z } from 'zod';

export const updatesQuerySchema = z.object({
  lang: z.enum(['tr', 'en']).optional(),
});
