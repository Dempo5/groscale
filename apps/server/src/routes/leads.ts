import { Router, Request, Response } from 'express';

const router = Router();

const DEMO_LEADS = [
  { id: 1, name: 'Test Lead', email: 'lead@example.com' },
  { id: 2, name: 'Demo Lead', email: 'demo@example.com' }
];

router.get('/', (_req: Request, res: Response) => {
  res.json(DEMO_LEADS);
});

export default router;
