export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { normalizeProduct, resolveOfferLabels } from "@/lib/products";

export async function GET() {
  try {
    const data = await redis.hgetall<Record<string, unknown>>(KEYS.products);
    const products: any[] = [];
    if (data) {
      for (const val of Object.values(data)) {
        const raw = parseHashValue<any>(val);
        if (!raw) continue;
        const p = normalizeProduct(raw);
        if (!p.active || p.offers.length === 0) continue;
        // Public shape deliberately omits catalog/provider internals
        // (catalogProductId, catalogItemId, countryId, platformId, price) —
        // the site sells via codes, not prices, so the customer only needs
        // an id and a label to choose between offers. Labels are resolved
        // together so two offers can never show the exact same text, even
        // if the admin left them all blank.
        const labels = resolveOfferLabels(p.offers);
        products.push({
          id: p.id,
          name: p.name,
          country: p.country,
          offerCount: p.offers.length,
          offers: p.offers.map((o, i) => ({
            id: o.id,
            providerId: o.providerId,
            label: labels[i],
          })),
        });
      }
    }
    return NextResponse.json({ success: true, products });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
