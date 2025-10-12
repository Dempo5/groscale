// apps/server/src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';

const app = express();

// CORS
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());

// Health + root
app.get('/', (_req, res) =>
  res.type('text/html').send(
    `<pre>GroScale API is running ✅
Try:
  POST /api/auth/register
  POST /api/auth/login
  GET  /api/leads (with Bearer token)
  POST /api/leads (with Bearer token)</pre>`
  )
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
