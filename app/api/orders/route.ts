export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { getProviderClient } from "@/lib/providers";
import { normalizeVoucher } from "@/lib/vouchers";
import { normalizeProduct } from "@/lib/products";
import type { Order, Voucher, ProviderId } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { productId, code, offerId, providerId } = await req.json();

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "A code is required to get a number" }, { status: 400 });
    }

    const productData = await redis.hget<string>(KEYS.products, productId);
    if (!productData) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const product = normalizeProduct(typeof productData === "string" ? JSON.parse(productData) : productData);
    if (!product.active) return NextResponse.json({ error: "Product inactive" }, { status: 400 });
    if (product.offers.length === 0) return NextResponse.json({ error: "This service has no provider configured yet" }, { status: 400 });

    // Preferred: match the exact offer the customer picked. A product with
    // just one offer doesn't need a pick at all. `providerId` alone is kept
    // as a fallback for older clients — it's ambiguous when a provider has
    // more than one offer on this product, so it just grabs the first match.
    const offer =
      (offerId && product.offers.find(o => o.id === offerId)) ||
      (product.offers.length === 1 ? product.offers[0] : null) ||
      (providerId && product.offers.find(o => o.providerId === providerId)) ||
      null;
    if (!offer) return NextResponse.json({ error: "Choose which option to get this number from" }, { status: 400 });
    const chosenProviderId: ProviderId = offer.providerId;

    // Look up and validate the code server-side — never trust that the
    // client only got here because it already checked.
    const voucherData = await redis.hgetall<Record<string, unknown>>(KEYS.vouchers);
    let voucher: Voucher | null = null;
    if (voucherData) {
      for (const [id, val] of Object.entries(voucherData)) {
        const raw = parseHashValue<any>(val);
        if (raw && raw.code === String(code).toUpperCase()) {
          voucher = normalizeVoucher({ ...raw, id });
          break;
        }
      }
    }
    if (!voucher) return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    if (voucher.used) return NextResponse.json({ error: "This code has already been used" }, { status: 400 });
    if (!voucher.productIds.includes(productId)) {
      return NextResponse.json({ error: "This code is not valid for this service" }, { status: 400 });
    }

    // If a number is already in progress on this code, resume it instead of
    // pulling a second one.
    if (voucher.orderId) {
      const existingData = await redis.hget<string>(KEYS.orders, voucher.orderId);
      if (existingData) {
        const existing: Order = typeof existingData === "string" ? JSON.parse(existingData) : existingData;
        if (existing.status === "active" || existing.status === "otp_received") {
          return NextResponse.json({ success: true, order: existing });
        }
      }
    }

    // Several catalog listings share one catalog_product_id and differ only
    // in price. Ordering by catalog_product_id lets the provider route to ANY
    // tier (usually the cheapest), ignoring the listing the admin picked.
    // The listing's own id (catalogItemId) is the exact tier-slot — pass it
    // as product_id so the customer gets exactly the selected listing.
    // Older offers saved before this field existed fall back to the old
    // routed behavior.
    const createBody = offer.catalogItemId
      ? { product_id: offer.catalogItemId, quantity: 1 }
      : { catalog_product_id: offer.catalogProductId, max_price: "2.00", quantity: 1 };

    const client = getProviderClient(chosenProviderId);
    const result = await client.createOrder(createBody);

    const smsOrder = result.data.orders[0];
    const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const order: Order = {
      id: orderId,
      productId,
      providerId: chosenProviderId,
      offerId: offer.id,
      smscodeOrderId: smsOrder.id,
      phoneNumber: smsOrder.phone_number || "",
      status: "active",
      otpCode: null,
      otpMessage: null,
      smsRevision: 0,
      amountUsd: smsOrder.amount?.amount || "0",
      createdAt: new Date().toISOString(),
      expiresAt: smsOrder.expires_at || null,
      otpReceivedAt: null,
      canceledAt: null,
      canReactivate: false,
      messageCount: 0,
      otpHistory: [],
      voucherId: voucher.id,
      voucherCode: voucher.code,
    };

    await redis.hset(KEYS.orders, { [orderId]: JSON.stringify(order) });
    await redis.set(KEYS.orderBySms(chosenProviderId, smsOrder.id), orderId);
    await redis.hset(KEYS.vouchers, { [voucher.id]: JSON.stringify({ ...voucher, orderId }) });

    return NextResponse.json({ success: true, order });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
