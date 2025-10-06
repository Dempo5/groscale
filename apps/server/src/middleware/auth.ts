import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export default function auth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  if (!hdr?.startsWith("Bearer ")) return res.status(401).json({ error: "missing auth" });
  try {
    const token = hdr.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_me") as any;
    (req as any).uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: "bad token" });
  }
}
