// Identifies which upstream SMS API a given offer/order goes through. Fixed
// to two slots for now — see lib/providers.ts for their actual credentials.
export type ProviderId = "provider1" | "provider2";

// One purchasable "listing" of a Product with a specific provider. A single
// Product (the service the customer sees, e.g. "Blizzard UK") can carry more
// than one offer — including several from the SAME provider (e.g. different
// tiers/listings) — so the customer can pick which one to pull the number
// from.
export interface ProductOffer {
  // Unique per offer, stable across edits (reorders/label changes) so
  // orders and stats can point at a specific offer, not just a provider.
  id: string;
  providerId: ProviderId;
  // Optional custom label shown to the customer instead of the provider's
  // default name (e.g. "Fast", "Backup") — falls back to the provider's
  // configured name when empty, and gets a disambiguating "#2", "#3"...
  // suffix at display time if that would otherwise collide with another
  // offer's resolved label (see lib/products.ts#resolveOfferLabels).
  label?: string;
  countryId: number;
  platformId: number;
  catalogProductId: number;
  // The listing's own SMSCode ID (the "exact tier-slot" id). Several catalog
  // rows can share one catalogProductId but differ in price — this is the
  // field that actually distinguishes them and must be used when ordering.
  catalogItemId: number;
  // No longer shown to customers or required from the admin — the site
  // sells via codes, not prices. Kept optional only so old records that
  // still have a value don't break when read back.
  displayPrice?: string;
}

export interface Product {
  id: string;
  name: string;
  country: string;
  active: boolean;
  createdAt: string;
  offers: ProductOffer[];
  // --- Legacy single-offer fields ---
  // Products saved before multi-provider support only had these top-level
  // fields instead of `offers`. lib/products.ts normalizes any record read
  // from Redis into the offers[] shape, folding these into a single
  // "provider1" offer the first time they're read — kept optional here only
  // so that normalization code can still type-check against the raw shape.
  countryId?: number;
  platformId?: number;
  catalogProductId?: number;
  catalogItemId?: number;
  displayPrice?: string;
}

export interface Order {
  id: string;
  productId: string;
  // Which provider this specific order was placed with. Orders created
  // before multi-provider support won't have this stored — treat a missing
  // value as "provider1", the only provider that existed back then.
  providerId: ProviderId;
  // Which exact offer (listing) was used — lets stats be broken down per
  // offer, not just per provider, since one provider can now have several
  // offers on the same product. Null for orders placed before this field
  // existed; they still count at the provider level, just not per-offer.
  offerId: string | null;
  smscodeOrderId: number;
  phoneNumber: string;
  status: "active" | "otp_received" | "completed" | "canceled" | "expired" | "burned";
  otpCode: string | null;
  otpMessage: string | null;
  smsRevision: number;
  amountUsd: string;
  createdAt: string;
  expiresAt: string | null;
  otpReceivedAt: string | null;
  canceledAt: string | null;
  canReactivate: boolean;
  messageCount: number;
  // Every code/message received on this number, oldest first. otpCode above
  // always mirrors the most recent entry here — this is kept so the customer
  // can see everything that ever arrived (e.g. after "Send Again"), not just
  // the latest one.
  otpHistory: OtpEntry[];
  // Which code was redeemed to create this order, so we can release/burn it
  // at the right time.
  voucherId: string | null;
  voucherCode: string | null;
  // Soft-delete for the admin log: archived orders are hidden from the main
  // log view but not actually removed from Redis, so a bulk "clear" action
  // can be undone (via "Restore") before anyone commits to permanently
  // deleting them.
  archived?: boolean;
  archivedAt?: string | null;
}

export interface OtpEntry {
  code: string | null;
  message: string | null;
  receivedAt: string;
}

export interface Voucher {
  id: string;
  code: string;
  // A code can now be valid for more than one service/country. The customer
  // picks which one to redeem it against when they use it.
  productIds: string[];
  used: boolean;
  usedAt?: string;
  // The order currently "holding" this code, if any (cleared again if the
  // customer cancels before receiving a message, so the code stays reusable).
  orderId?: string | null;
  createdAt: string;
}
