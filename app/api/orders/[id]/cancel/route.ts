export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";
import { getProviderClient, resolveProviderId } from "@/lib/providers";
import { releaseVoucherOrder } from "@/lib/vouchers";
import type { Order } from "@/lib/types";

// The upstream provider refuses to cancel a number before it's been held for
// this long. We check this ourselves first so the customer gets one clear,
// predictable message instead of a raw provider error.
const MIN_HOLD_SECONDS = 120;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await redis.hget<string>(KEYS.orders, params.id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const order: Order = typeof data === "string" ? JSON.parse(data) : data;
    const providerId = resolveProviderId(order.providerId);
    const client = getProviderClient(providerId);

    if (order.status !== "active" && order.status !== "otp_received") {
      // Already resolved on our side (e.g. a poll already caught it expiring).
      // If it expired without ever receiving a code, make sure the code was
      // actually freed — this is a no-op if it already was.
      if (order.status === "expired" && !order.otpCode) {
        await releaseVoucherOrder(order.voucherId, order.id);
      }
      return NextResponse.json({ success: true, order, codeReusable: order.status === "expired" && !order.otpCode });
    }

    const elapsedSeconds = (Date.now() - new Date(order.createdAt).getTime()) / 1000;
    if (elapsedSeconds < MIN_HOLD_SECONDS) {
      const retryAfterSeconds = Math.ceil(MIN_HOLD_SECONDS - elapsedSeconds);
      return NextResponse.json(
        { success: false, error: "TOO_EARLY", retryAfterSeconds },
        { status: 429 }
      );
    }

    try {
      await client.cancelOrder(order.smscodeOrderId);
    } catch (err: any) {
      // The number may have expired upstream between our last poll and this
      // click — the provider then refuses the cancel and tells us so
      // directly (its error text, not the "EXP" status code, e.g. "Cannot
      // cancel order in 'EXPIRED' status"). Treat that as expired straight
      // away instead of surfacing a raw provider error to the customer.
      const msg: string = err.message || "";
      let isExpired = /expired/i.test(msg);

      // Fall back to asking the provider directly if its error text didn't
      // make it obvious — this call can itself fail for an already-expired
      // order, so it's a best-effort second check, not the only one.
      if (!isExpired) {
        try {
          const sms = await client.getOrder(order.smscodeOrderId);
          isExpired = sms.data.status === "EXP";
        } catch {}
      }

      if (isExpired) {
        const codeReusable = !order.otpCode;
        const expiredOrder: Order = { ...order, providerId, status: "expired" };
        await redis.hset(KEYS.orders, { [order.id]: JSON.stringify(expiredOrder) });
        if (codeReusable) {
          await releaseVoucherOrder(order.voucherId, order.id);
        }
        return NextResponse.json({ success: true, order: expiredOrder, codeReusable });
      }

      return NextResponse.json(
        { success: false, error: msg || "Could not cancel this number right now. Please try again in a moment." },
        { status: 500 }
      );
    }

    // No message ever arrived on this number, so the code isn't burned —
    // free it up so the customer can use it again.
    const codeReusable = order.status === "active" && !order.otpCode;

    const updated: Order = { ...order, providerId, status: "canceled", canceledAt: new Date().toISOString() };
    await redis.hset(KEYS.orders, { [order.id]: JSON.stringify(updated) });

    if (codeReusable) {
      await releaseVoucherOrder(order.voucherId, order.id);
    }

    return NextResponse.json({ success: true, order: updated, codeReusable });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
