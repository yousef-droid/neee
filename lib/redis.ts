import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export const KEYS = {
  products: "qsp:products",
  product: (id: string) => `qsp:product:${id}`,
  orders: "qsp:orders",
  order: (id: string) => `qsp:order:${id}`,
  // Namespaced by provider — two different providers can (and sometimes do)
  // hand out overlapping order IDs, so the same smsId alone isn't safe to
  // use as a key across providers.
  orderBySms: (providerId: string, smsId: number) => `qsp:order:sms:${providerId}:${smsId}`,
  vouchers: "qsp:vouchers",
  voucher: (id: string) => `qsp:voucher:${id}`,
} as const;

// The @upstash/redis client auto-deserializes JSON-looking hash values back into
// objects, so a value read from hgetall/hget can come back either as a string
// (needs JSON.parse) or already as an object, depending on the client version/config.
// Always go through this helper instead of assuming one or the other.
export function parseHashValue<T>(val: unknown): T | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return val as T;
}
