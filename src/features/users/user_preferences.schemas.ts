import { z } from 'zod';
import { LANGUAGES, TEXT_SIZES } from '../../constants/domain';

/** PATCH body: partial update; at least one field must be present. */
export const updatePreferencesSchema = z
  .object({
    text_size: z.enum(TEXT_SIZES).optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .refine((value) => value.text_size !== undefined || value.language !== undefined, {
    message: 'En az bir tercih alanı gönderilmeli.',
  });

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
