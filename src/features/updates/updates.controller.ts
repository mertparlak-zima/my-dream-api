import { Hono } from 'hono';
import { zValidator } from '../../utils/zValidator';
import { updatesQuerySchema } from './updates.schemas';
import { updatesService } from './updates.service';

export const updatesRoutes = new Hono();

updatesRoutes.get('/', zValidator('query', updatesQuerySchema), async (c) => {
  const lang = c.req.valid('query').lang ?? 'tr';

  return c.json({ success: true, data: await updatesService.listUpdates(lang) });
});
