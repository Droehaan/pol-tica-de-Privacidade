import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSetting, setSetting } from "../db.js";

const SESSION_COOKIE = "resale_hub_session";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function ensureAdminPassword(password: string) {
  const existing = getSetting("admin_password_hash");
  if (!existing) {
    setSetting("admin_password_hash", hashPassword(password));
  }
}

export function login(password: string): boolean {
  const stored = getSetting("admin_password_hash");
  if (!stored) {
    setSetting("admin_password_hash", hashPassword(password));
    return true;
  }
  return hashPassword(password) === stored;
}

function sessionToken(): string {
  const secret = process.env.APP_SECRET ?? "dev-secret";
  return crypto.createHmac("sha256", secret).update("admin").digest("hex");
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const publicPaths = ["/api/health", "/api/auth/login"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const token = req.cookies?.[SESSION_COOKIE] ?? req.headers["x-session-token"];
  if (token === sessionToken()) {
    return next();
  }

  return res.status(401).json({ error: "Não autenticado" });
}

export function setSessionCookie(res: Response) {
  res.cookie(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE);
}

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
    }
  }
}
