import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { createDreamSchema, dreamIdParamSchema, listDreamsQuerySchema, submitDreamFeedbackSchema } from './dreams.schemas';
import { dreamsService } from './dreams.service';

export const dreamsRoutes = new Hono();

dreamsRoutes.use('*', authMiddleware);

dreamsRoutes.get('/', zValidator('query', listDreamsQuerySchema), async (c) => {
  const dreams = await dreamsService.listDreams(getAuthUserId(c), c.req.valid('query'));

  return c.json({ success: true, data: dreams });
});

dreamsRoutes.post('/', zValidator('json', createDreamSchema), async (c) => {
  const dream = await dreamsService.createDream(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: dream }, 202);
});

dreamsRoutes.get('/:id', zValidator('param', dreamIdParamSchema), async (c) => {
  const dream = await dreamsService.getDreamById(getAuthUserId(c), c.req.valid('param').id);

  return c.json({ success: true, data: dream });
});

dreamsRoutes.patch(
  '/:id/feedback',
  zValidator('param', dreamIdParamSchema),
  zValidator('json', submitDreamFeedbackSchema),
  async (c) => {
    const dream = await dreamsService.submitFeedback(getAuthUserId(c), c.req.valid('param').id, c.req.valid('json'));

    return c.json({ success: true, data: dream });
  },
);
