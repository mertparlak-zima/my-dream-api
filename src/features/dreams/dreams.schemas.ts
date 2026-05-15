import { z } from 'zod';
import { DREAM_CONFIG } from '../../config';

export const createDreamSchema = z.object({
  content: z.string().min(DREAM_CONFIG.MIN_CONTENT_LENGTH).max(DREAM_CONFIG.MAX_CONTENT_LENGTH),
  interpreter_id: z.uuid(),
});

export const listDreamsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dreamIdParamSchema = z.object({
  id: z.uuid(),
});

export const submitDreamFeedbackSchema = z.object({
  rating: z.number().int().min(DREAM_CONFIG.MIN_RATING).max(DREAM_CONFIG.MAX_RATING),
  feedback_text: z.string().max(DREAM_CONFIG.MAX_FEEDBACK_LENGTH).optional(),
});

export type CreateDreamInput = z.infer<typeof createDreamSchema>;
export type ListDreamsQuery = z.infer<typeof listDreamsQuerySchema>;
export type SubmitDreamFeedbackInput = z.infer<typeof submitDreamFeedbackSchema>;
