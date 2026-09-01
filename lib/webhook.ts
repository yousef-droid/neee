import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";
import { markVoucherUsedIfNeeded } from "@/lib/vouchers";
import { appendOtpEntry } from "@/lib/otp";
import { resolveProviderId } from "@/lib/providers";
import type { Order } from "@/lib/types";

// Shared by both the legacy (provider1) webhook URL and the per-provider
// ones — the payload shape from the upstream API is the same either way,
// only which provider's order index we look the order up in differs.
export async function handleProviderWebhook(req: NextRequest, providerId: string) {
  try {
    const body = await req.json();
    if (body.event === "order.otp_received") {
      const smsId = body.data.order_id;
      const orderId = await redis.get<string>(KEYS.orderBySms(resolveProviderId(providerId), smsId));
      if (orderId) {
        const data = await redis.hget<string>(KEYS.orders, orderId);
        if (data) {
          const order: Order = typeof data === "string" ? JSON.parse(data) : data;
          const updated: Order = {
            ...order,
            providerId: resolveProviderId(providerId),
            status: "otp_received",
            otpCode: body.data.otp_code || order.otpCode,
            otpMessage: body.data.otp_message || order.otpMessage,
            otpHistory: body.data.otp_code
              ? appendOtpEntry(order, body.data.otp_code, body.data.otp_message, body.timestamp)
              : (order.otpHistory || []),
            smsRevision: body.data.sms_revision ?? order.smsRevision,
            otpReceivedAt: body.timestamp || new Date().toISOString(),
            canReactivate: body.data.can_reactivate ?? order.canReactivate,
          };
          await redis.hset(KEYS.orders, { [orderId]: JSON.stringify(updated) });
          await markVoucherUsedIfNeeded(order.voucherId);
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
