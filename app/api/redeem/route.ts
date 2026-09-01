export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { normalizeVoucher } from "@/lib/vouchers";
import type { Voucher, Order } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { code, productId } = await req.json();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const data = await redis.hgetall<Record<string, unknown>>(KEYS.vouchers);
  if (!data) return NextResponse.json({ error: "Invalid code" }, { status: 404 });

  let voucher: Voucher | null = null;

  for (const [id, val] of Object.entries(data)) {
    const raw = parseHashValue<any>(val);
    if (raw && raw.code === String(code).toUpperCase()) {
      voucher = normalizeVoucher({ ...raw, id });
      break;
    }
  }

  if (!voucher) return NextResponse.json({ error: "Invalid code" }, { status: 404 });
  if (voucher.used) return NextResponse.json({ error: "This code has already been used" }, { status: 400 });

  // An empty productIds list is a deliberate wildcard ("any service"), not
  // an incomplete code — only reject when the code names specific services
  // and this isn't one of them.
  if (productId && voucher.productIds.length > 0 && !voucher.productIds.includes(productId)) {
    return NextResponse.json({ error: "This code is not valid for this service" }, { status: 400 });
  }

  // If this code already has a number in progress, point the caller back at
  // it instead of letting a second number get pulled on the same code.
  if (voucher.orderId) {
    const orderData = await redis.hget<string>(KEYS.orders, voucher.orderId);
    if (orderData) {
      const existing: Order = typeof orderData === "string" ? JSON.parse(orderData) : orderData;
      if (existing.status === "active" || existing.status === "otp_received") {
        return NextResponse.json({
          success: true,
          voucher,
          existingOrderId: existing.id,
          existingProductId: existing.productId,
        });
      }
    }
  }

  return NextResponse.json({ success: true, voucher });
}
