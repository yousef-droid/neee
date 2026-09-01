export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { checkAdminAuth } from "@/lib/auth";
import { resolveProviderId } from "@/lib/providers";
import type { Order } from "@/lib/types";

async function requireAdmin(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  if (auth.ok) return null;
  if (auth.locked) {
    return NextResponse.json({ error: "locked", retryAfterSeconds: auth.retryAfterSeconds }, { status: 429 });
  }
  return NextResponse.json({ error: "Unauthorized", attemptsRemaining: auth.attemptsRemaining }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.orders);
  const orders: Order[] = [];
  if (data) {
    for (const val of Object.values(data)) {
      const o = parseHashValue<Order>(val);
      if (o) orders.push({ ...o, providerId: resolveProviderId(o.providerId) });
    }
  }
  return NextResponse.json({ success: true, orders });
}

// Matches a stored order against the request body's selection criteria.
// `ids` (exact selection) short-circuits everything else. Otherwise `scope`
// narrows by status, and an optional date range further narrows by
// createdAt — the two combine (e.g. scope "canceled" + a date range means
// "canceled orders placed in this window").
function matchesSelection(
  o: Order,
  body: { ids?: string[]; scope?: string; dateFrom?: string; dateTo?: string }
): boolean {
  if (body.ids && body.ids.length > 0) return body.ids.includes(o.id);

  if (body.scope === "canceled" && o.status !== "canceled") return false;
  if (body.scope === "finished" && !["completed", "canceled", "expired", "burned"].includes(o.status)) return false;
  // scope === "all" (or omitted, when a date range alone is given): no status filter.

  if (body.dateFrom) {
    const from = new Date(body.dateFrom).getTime();
    if (!o.createdAt || new Date(o.createdAt).getTime() < from) return false;
  }
  if (body.dateTo) {
    // Treat dateTo as inclusive of the whole day.
    const to = new Date(body.dateTo).getTime() + 24 * 60 * 60 * 1000;
    if (!o.createdAt || new Date(o.createdAt).getTime() >= to) return false;
  }

  return true;
}

// Soft-deletes matching orders (moves them into the "Archived" view instead
// of removing them). This is what the log's various "Clear..." actions call
// — nothing is actually destroyed here. Pass `unarchive: true` to restore
// archived orders back into the main log instead.
//
// Body: { ids?: string[], scope?: "all"|"finished"|"canceled", dateFrom?, dateTo?, unarchive?: boolean }
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const unarchive = body.unarchive === true;

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.orders);
  if (!data) return NextResponse.json({ success: true, affectedCount: 0 });

  const updates: Record<string, string> = {};
  let affectedCount = 0;

  for (const [id, val] of Object.entries(data)) {
    const o = parseHashValue<Order>(val);
    if (!o) continue;
    const alreadyInTargetState = unarchive ? !o.archived : !!o.archived;
    if (alreadyInTargetState) continue;
    if (!matchesSelection(o, body)) continue;

    updates[id] = JSON.stringify({
      ...o,
      providerId: resolveProviderId(o.providerId),
      archived: !unarchive,
      archivedAt: unarchive ? null : new Date().toISOString(),
    });
    affectedCount++;
  }

  if (affectedCount > 0) {
    await redis.hset(KEYS.orders, updates);
  }

  return NextResponse.json({ success: true, affectedCount });
}

// Permanently deletes orders. As a hard safety rule enforced here — not just
// in the UI — this only ever deletes orders that are ALREADY archived,
// regardless of what the request asks for, so there's no way to skip the
// archive step and instantly lose data by mistake.
//
// Body: { ids?: string[], scope?: "all"|"finished"|"canceled", dateFrom?, dateTo? }
// Omitting everything (empty body) deletes ALL archived orders.
export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.orders);
  if (!data) return NextResponse.json({ success: true, deletedCount: 0 });

  const idsToDelete: string[] = [];
  const smsIndexKeysToDelete: string[] = [];

  for (const [id, val] of Object.entries(data)) {
    const o = parseHashValue<Order>(val);
    if (!o || !o.archived) continue;
    if (!matchesSelection(o, body)) continue;

    idsToDelete.push(id);
    if (o.smscodeOrderId) {
      smsIndexKeysToDelete.push(KEYS.orderBySms(resolveProviderId(o.providerId), o.smscodeOrderId));
    }
  }

  if (idsToDelete.length > 0) {
    await redis.hdel(KEYS.orders, ...idsToDelete);
  }
  if (smsIndexKeysToDelete.length > 0) {
    await redis.del(...smsIndexKeysToDelete);
  }

  return NextResponse.json({ success: true, deletedCount: idsToDelete.length });
}
