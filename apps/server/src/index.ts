// apps/server/src/index.ts
if (process.env.NODE_ENV !== 'production') {
  await import('dotenv/config');
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();

// CORS – allow your Vercel domains
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);              // allow curl/postman
      if (allowed.length === 0) return cb(null, true); // allow all if not set
      cb(null, allowed.includes(origin));
    },
    credentials: true,
  }),
);

app.use(express.json());

// Health
app.get('/_health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Friendly root page (so you don’t see “Not found”)
app.get('/', (_req, res) => {
  res.type('text/plain').send('GroScale API is running ✅  Try /api/leads');
});

// Demo leads endpoint used by the frontend
app.get('/api/leads', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Test Lead', email: 'lead@example.com' },
    { id: 2, name: 'Demo Lead', email: 'demo@example.com' },
  ]);
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
