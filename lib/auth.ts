import { NextRequest } from "next/server";
import { redis } from "./redis";

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 5 * 60;

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; locked: true; retryAfterSeconds: number }
  | { ok: false; locked: false; attemptsRemaining: number };

// Rate-limited password check: after MAX_ATTEMPTS wrong passwords from the
// same IP, every further attempt (even a correct one) is blocked until
// LOCKOUT_SECONDS have passed since the first wrong attempt.
export async function checkAdminAuth(req: NextRequest, password: string): Promise<AdminAuthResult> {
  const ip = getClientIp(req);
  const key = `qsp:admin:fail:${ip}`;

  const rawCount = await redis.get<string | number>(key);
  const count = rawCount ? Number(rawCount) : 0;

  if (count >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return { ok: false, locked: true, retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS };
  }

  const expected = process.env.ADMIN_PASSWORD || "admin123";
  if (password === expected) {
    await redis.del(key);
    return { ok: true };
  }

  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expire(key, LOCKOUT_SECONDS);
  }
  if (newCount >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    return { ok: false, locked: true, retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS };
  }
  return { ok: false, locked: false, attemptsRemaining: MAX_ATTEMPTS - newCount };
}
