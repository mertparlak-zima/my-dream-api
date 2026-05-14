import { z } from 'zod';

export const interpreterIdParamSchema = z.object({
  id: z.uuid(),
});
