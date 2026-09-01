export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";
import { getProviderClient, resolveProviderId } from "@/lib/providers";
import type { Order } from "@/lib/types";



export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await redis.hget<string>(KEYS.orders, params.id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const order: Order = typeof data === "string" ? JSON.parse(data) : data;
    const providerId = resolveProviderId(order.providerId);
    const result = await getProviderClient(providerId).reactivateOrder(order.smscodeOrderId, "2.00");
    const child = result.data.orders[0];
    const updated: Order = {
      ...order,
      providerId,
      smscodeOrderId: child.id,
      status: "active",
      otpCode: null,
      otpMessage: null,
      smsRevision: 0,
      otpReceivedAt: null,
      expiresAt: child.expires_at || null,
      messageCount: order.messageCount + 1,
    };
    await redis.hset(KEYS.orders, { [order.id]: JSON.stringify(updated) });
    await redis.set(KEYS.orderBySms(providerId, child.id), order.id);
    return NextResponse.json({ success: true, order: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
