import type { Product, ProductOffer } from "./types";
import { PROVIDERS } from "./providers";

// Products saved before multi-provider support had a single catalogItemId /
// catalogProductId pair directly on the product instead of an offers[]
// array. This folds any shape we might read back from Redis into the
// current offers[] shape (as a single "provider1" offer, since provider1 is
// what used to be the only provider) so the rest of the app never has to
// think about the old format.
export function normalizeProduct(raw: any): Product {
  let offers: ProductOffer[] = Array.isArray(raw?.offers) ? raw.offers : [];

  if (offers.length === 0 && (raw?.catalogItemId || raw?.catalogProductId)) {
    offers = [
      {
        id: `off-legacy-${raw.id}`,
        providerId: "provider1",
        countryId: Number(raw.countryId) || 0,
        platformId: Number(raw.platformId) || 0,
        catalogProductId: Number(raw.catalogProductId) || 0,
        catalogItemId: Number(raw.catalogItemId) || 0,
        displayPrice: raw.displayPrice || "0",
      },
    ];
  }

  // Offers saved before per-offer ids existed don't have one yet — backfill
  // a stable, deterministic id so they can still be selected/tracked like
  // any other offer. It gets persisted for real (via admin/products'
  // parseOffer, which preserves any id it's handed) the next time this
  // product is edited.
  offers = offers.map((o, i) => (o.id ? o : { ...o, id: `off-legacy-${raw.id}-${i}` }));

  return {
    id: raw.id,
    name: raw.name,
    country: raw.country || "Unknown",
    active: !!raw.active,
    createdAt: raw.createdAt,
    offers,
  };
}

function providerDisplayName(id: string): string {
  return PROVIDERS.find(p => p.id === id)?.name || id;
}

// Resolves a customer-facing label for every offer on a product, guaranteeing
// no two offers ever display identical text — even if the admin left every
// label blank, or added several offers from the same provider. Any label
// that would otherwise collide gets a running "#2", "#3"... suffix, in
// array order.
export function resolveOfferLabels(offers: ProductOffer[]): string[] {
  const raw = offers.map(o => (o.label && o.label.trim()) || providerDisplayName(o.providerId));
  const seen: Record<string, number> = {};
  return raw.map(label => {
    seen[label] = (seen[label] || 0) + 1;
    return seen[label] > 1 ? `${label} #${seen[label]}` : label;
  });
}
