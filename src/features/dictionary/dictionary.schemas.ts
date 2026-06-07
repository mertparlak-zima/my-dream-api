import { z } from 'zod';

const langSchema = z.enum(['tr', 'en']).optional();

export const dictionaryQuerySchema = z.object({
  lang: langSchema,
});

export const dictionarySearchQuerySchema = z.object({
  q: z.string().optional(),
  lang: langSchema,
});
