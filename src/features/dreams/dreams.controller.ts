import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { createDreamSchema, dreamIdParamSchema, submitDreamFeedbackSchema } from './dreams.schemas';
import { dreamsService } from './dreams.service';

export const dreamsRoutes = new Hono();

dreamsRoutes.use('*', authMiddleware);

dreamsRoutes.get('/', (c) => {
  dreamsService.listDreams();
  return c.json({ success: true });
});

dreamsRoutes.post('/', zValidator('json', createDreamSchema), (c) => {
  dreamsService.createDream();
  return c.json({ success: true }, 202);
});

dreamsRoutes.get('/:id', zValidator('param', dreamIdParamSchema), (c) => {
  dreamsService.getDreamById();
  return c.json({ success: true });
});

dreamsRoutes.patch(
  '/:id/feedback',
  zValidator('param', dreamIdParamSchema),
  zValidator('json', submitDreamFeedbackSchema),
  (c) => {
    dreamsService.submitFeedback();
    return c.json({ success: true });
  },
);
