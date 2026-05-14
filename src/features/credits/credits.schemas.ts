import { z } from 'zod';

export const creditTransactionIdParamSchema = z.object({
  id: z.uuid(),
});
