import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { zValidator } from '../../utils/zValidator';
import {
  clientRequestIdParamSchema,
  createDreamSchema,
  dreamIdParamSchema,
  listDreamsQuerySchema,
  setBookmarkSchema,
  submitDreamFeedbackSchema,
} from './dreams.schemas';
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

// Registered before /:id so the literal segment is not captured as an id param.
dreamsRoutes.get(
  '/by-client-request-id/:clientRequestId',
  zValidator('param', clientRequestIdParamSchema),
  async (c) => {
    const dream = await dreamsService.getDreamByClientRequestId(
      getAuthUserId(c),
      c.req.valid('param').clientRequestId,
    );

    return c.json({ success: true, data: dream });
  },
);

dreamsRoutes.get('/:id', zValidator('param', dreamIdParamSchema), async (c) => {
  const dream = await dreamsService.getDreamById(getAuthUserId(c), c.req.valid('param').id);

  return c.json({ success: true, data: dream });
});

dreamsRoutes.delete('/:id', zValidator('param', dreamIdParamSchema), async (c) => {
  await dreamsService.deleteDream(getAuthUserId(c), c.req.valid('param').id);

  return c.json({ success: true, data: { id: c.req.valid('param').id } });
});

dreamsRoutes.patch(
  '/:id/bookmark',
  zValidator('param', dreamIdParamSchema),
  zValidator('json', setBookmarkSchema),
  async (c) => {
    const dream = await dreamsService.setBookmark(getAuthUserId(c), c.req.valid('param').id, c.req.valid('json'));

    return c.json({ success: true, data: dream });
  },
);

dreamsRoutes.patch(
  '/:id/feedback',
  zValidator('param', dreamIdParamSchema),
  zValidator('json', submitDreamFeedbackSchema),
  async (c) => {
    const dream = await dreamsService.submitFeedback(getAuthUserId(c), c.req.valid('param').id, c.req.valid('json'));

    return c.json({ success: true, data: dream });
  },
);
