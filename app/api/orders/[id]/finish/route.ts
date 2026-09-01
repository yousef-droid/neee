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
    await getProviderClient(providerId).finishOrder(order.smscodeOrderId);
    const updated: Order = { ...order, providerId, status: "completed" };
    await redis.hset(KEYS.orders, { [order.id]: JSON.stringify(updated) });
    return NextResponse.json({ success: true, order: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
