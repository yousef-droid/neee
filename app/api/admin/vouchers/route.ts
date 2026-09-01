export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { checkAdminAuth } from "@/lib/auth";
import { normalizeVoucher } from "@/lib/vouchers";
import type { Voucher } from "@/lib/types";

function lockedOrUnauthorized(auth: Awaited<ReturnType<typeof checkAdminAuth>>) {
  if (auth.ok) return null;
  if (auth.locked) {
    return NextResponse.json(
      { error: "locked", retryAfterSeconds: auth.retryAfterSeconds },
      { status: 429 }
    );
  }
  return NextResponse.json(
    { error: "Unauthorized", attemptsRemaining: auth.attemptsRemaining },
    { status: 401 }
  );
}

export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  const denied = lockedOrUnauthorized(auth);
  if (denied) return denied;

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.vouchers);
  const vouchers: Voucher[] = [];
  if (data) {
    for (const [id, val] of Object.entries(data)) {
      const raw = parseHashValue<any>(val);
      if (raw) vouchers.push(normalizeVoucher({ ...raw, id }));
    }
  }
  return NextResponse.json({ success: true, vouchers });
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  const denied = lockedOrUnauthorized(auth);
  if (denied) return denied;

  const body = await req.json();

  // productIds === [] is a deliberate wildcard from here on ("any service"),
  // not an incomplete form — so it's only rejected when the caller didn't
  // explicitly ask for that.
  const anyService = !!body.anyService;
  const productIds: string[] = anyService
    ? []
    : Array.isArray(body.productIds)
    ? body.productIds.filter((x: unknown) => typeof x === "string" && x)
    : body.productId
    ? [body.productId]
    : [];

  if (!anyService && productIds.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one service, or set anyService to make the code work for all of them' },
      { status: 400 }
    );
  }

  // Accepts either a single `code` (unchanged, existing behavior) or a bulk
  // `codes` array so many can be generated in one request.
  const rawCodes: unknown[] = Array.isArray(body.codes) ? body.codes : body.code ? [body.code] : [];

  const seen = new Set<string>();
  const normalizedCodes: string[] = [];
  for (const c of rawCodes) {
    if (typeof c !== "string") continue;
    const trimmed = c.trim().toUpperCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalizedCodes.push(trimmed);
  }

  if (normalizedCodes.length === 0) {
    return NextResponse.json({ error: "Enter at least one code" }, { status: 400 });
  }

  // Codes must be unique — check every existing voucher before saving.
  const existingData = await redis.hgetall<Record<string, unknown>>(KEYS.vouchers);
  const existingCodes = new Set<string>();
  if (existingData) {
    for (const val of Object.values(existingData)) {
      const raw = parseHashValue<any>(val);
      if (raw?.code) existingCodes.add(String(raw.code).toUpperCase());
    }
  }

  const created: Voucher[] = [];
  const skipped: { code: string; reason: string }[] = [];
  const toWrite: Record<string, string> = {};

  normalizedCodes.forEach((code, i) => {
    if (existingCodes.has(code)) {
      skipped.push({ code, reason: "Already exists" });
      return;
    }
    const voucher: Voucher = {
      id: `vch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      code,
      productIds,
      used: false,
      orderId: null,
      createdAt: new Date().toISOString(),
    };
    created.push(voucher);
    toWrite[voucher.id] = JSON.stringify(voucher);
  });

  if (created.length > 0) {
    await redis.hset(KEYS.vouchers, toWrite);
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "That code already exists", skipped }, { status: 400 });
  }

  return NextResponse.json({ success: true, vouchers: created, voucher: created[0], skipped });
}

export async function PATCH(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  const denied = lockedOrUnauthorized(auth);
  if (denied) return denied;

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string" && x)
    : body.id
    ? [body.id]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No codes selected" }, { status: 400 });
  }

  // Same wildcard rule as creation: anyService explicitly clears productIds
  // rather than that being treated as an incomplete request.
  const anyService = !!body.anyService;
  const productIds: string[] = anyService
    ? []
    : Array.isArray(body.productIds)
    ? body.productIds.filter((x: unknown) => typeof x === "string" && x)
    : [];

  if (!anyService && productIds.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one service, or set anyService to make the codes work for all of them' },
      { status: 400 }
    );
  }

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.vouchers);
  const toWrite: Record<string, string> = {};
  const updated: Voucher[] = [];
  const missing: string[] = [];

  for (const id of ids) {
    const raw = data?.[id] ? parseHashValue<any>(data[id]) : null;
    if (!raw) { missing.push(id); continue; }
    // This intentionally REPLACES the code's services, it doesn't merge —
    // that's what lets a batch of codes be pointed at a new service in one go.
    const voucher: Voucher = { ...normalizeVoucher({ ...raw, id }), productIds };
    updated.push(voucher);
    toWrite[id] = JSON.stringify(voucher);
  }

  if (Object.keys(toWrite).length > 0) {
    await redis.hset(KEYS.vouchers, toWrite);
  }

  return NextResponse.json({ success: true, updated, missing });
}

export async function DELETE(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  const denied = lockedOrUnauthorized(auth);
  if (denied) return denied;

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string" && x)
    : body.id
    ? [body.id]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No codes selected" }, { status: 400 });
  }

  await redis.hdel(KEYS.vouchers, ...ids);
  return NextResponse.json({ success: true, deletedCount: ids.length });
}
