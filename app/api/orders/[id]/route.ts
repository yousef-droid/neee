export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";
import { getProviderClient, resolveProviderId } from "@/lib/providers";
import { markVoucherUsedIfNeeded, releaseVoucherOrder } from "@/lib/vouchers";
import { appendOtpEntry } from "@/lib/otp";
import type { Order } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await redis.hget<string>(KEYS.orders, params.id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let order: Order = typeof data === "string" ? JSON.parse(data) : data;
    const providerId = resolveProviderId(order.providerId);

    if (order.smscodeOrderId) {
      try {
        const sms = await getProviderClient(providerId).getOrder(order.smscodeOrderId);
        const d = sms.data;
        const newStatus = d.status === "OTP_RECEIVED" ? "otp_received" :
                          d.status === "COMPLETED" ? "completed" :
                          d.status === "CANCELED" ? "canceled" :
                          d.status === "EXP" ? "expired" : "active";
        const justReceived = order.status !== "otp_received" && newStatus === "otp_received";
        // No message ever landed on this number before it timed out — the
        // code was never actually spent, so free it up automatically.
        const justExpiredUnused = order.status !== "expired" && newStatus === "expired" && !order.otpCode;

        order = {
          ...order,
          providerId,
          status: order.status === "burned" ? "burned" : newStatus,
          otpCode: d.otp_code || order.otpCode,
          otpMessage: d.otp_message || order.otpMessage,
          otpHistory: d.otp_code ? appendOtpEntry(order, d.otp_code, d.otp_message, d.otp_received_at) : (order.otpHistory || []),
          smsRevision: d.sms_revision ?? order.smsRevision,
          otpReceivedAt: d.otp_received_at || order.otpReceivedAt,
          expiresAt: d.expires_at || order.expiresAt,
          canceledAt: d.canceled_at || order.canceledAt,
          canReactivate: d.can_reactivate ?? order.canReactivate,
        };
        await redis.hset(KEYS.orders, { [order.id]: JSON.stringify(order) });

        if (justReceived) {
          await markVoucherUsedIfNeeded(order.voucherId);
        }
        if (justExpiredUnused) {
          await releaseVoucherOrder(order.voucherId, order.id);
        }
      } catch {}
    }

    return NextResponse.json({ success: true, order });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
