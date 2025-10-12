// apps/server/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function signToken(userId: string) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '7d' });
}
