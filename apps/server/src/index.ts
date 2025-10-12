import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import leadsRouter from './routes/leads.js';

const app = express();

// CORS — allow your Vercel fronts and local dev
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());

// Health checks
app.get('/_health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// API
app.use('/api/leads', leadsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
