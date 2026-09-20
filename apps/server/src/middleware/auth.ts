// apps/server/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// No fallback on purpose: if the secret is missing, anyone who reads the code
// could forge login tokens. Refuse to start instead.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET must be set in apps/server/.env and be at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

export interface AuthedRequest extends Request {
  userId?: string;
}

// Generate JWT for login/register
export function signToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET!, { algorithm: "HS256", expiresIn: "7d" });
}

// Middleware: verify token on protected routes
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = header.slice("Bearer ".length);
  try {
    // only accept the algorithm we sign with
    const decoded = jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] }) as { id: string };
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
