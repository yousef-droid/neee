import { redis, KEYS } from "./redis";
import type { Voucher } from "./types";

// Older codes were saved with a single `productId` field. This normalizes
// any shape we might read back from Redis into the current `productIds[]`
// shape so the rest of the app never has to think about the old format.
export function normalizeVoucher(raw: any): Voucher {
  const productIds: string[] =
    Array.isArray(raw?.productIds) && raw.productIds.length > 0
      ? raw.productIds
      : raw?.productId
      ? [raw.productId]
      : [];
  return {
    id: raw.id,
    code: raw.code,
    productIds,
    used: !!raw.used,
    usedAt: raw.usedAt,
    orderId: raw.orderId ?? null,
    createdAt: raw.createdAt,
  };
}

// Marks a code as used (burned) the first time a real SMS message arrives on
// the number it was redeemed for. Safe to call more than once.
export async function markVoucherUsedIfNeeded(voucherId: string | null | undefined) {
  if (!voucherId) return;
  const data = await redis.hget<string>(KEYS.vouchers, voucherId);
  if (!data) return;
  const voucher = normalizeVoucher(typeof data === "string" ? JSON.parse(data) : data);
  if (voucher.used) return;
  const updated: Voucher = { ...voucher, used: true, usedAt: new Date().toISOString() };
  await redis.hset(KEYS.vouchers, { [voucherId]: JSON.stringify(updated) });
}

// Releases a code so it can be redeemed again — used when a number is
// canceled before any message was received on it.
export async function releaseVoucherOrder(voucherId: string | null | undefined, orderId: string) {
  if (!voucherId) return;
  const data = await redis.hget<string>(KEYS.vouchers, voucherId);
  if (!data) return;
  const voucher = normalizeVoucher(typeof data === "string" ? JSON.parse(data) : data);
  if (voucher.orderId !== orderId) return;
  const updated: Voucher = { ...voucher, orderId: null };
  await redis.hset(KEYS.vouchers, { [voucherId]: JSON.stringify(updated) });
}
