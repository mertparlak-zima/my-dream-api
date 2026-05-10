import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({ success: true, message: 'My Dream API v1.0' })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

export default app
