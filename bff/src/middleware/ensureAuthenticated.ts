import type { NextFunction, Request, Response } from "express";
import { ensureFreshTokens } from "./refreshToken";

/** Protects downstream API routes: rejects with 401 if there is no valid session. */
export async function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authenticated = await ensureFreshTokens(req);
  if (!authenticated) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}
