export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, parseHashValue } from "@/lib/redis";
import { checkAdminAuth } from "@/lib/auth";
import { normalizeProduct } from "@/lib/products";
import type { Product, ProductOffer } from "@/lib/types";

const PRODUCTS_KEY = KEYS.products;

function lockedOrUnauthorized(auth: Awaited<ReturnType<typeof checkAdminAuth>>) {
  if (auth.ok) return null;
  if (auth.locked) {
    return NextResponse.json(
      { error: "locked", retryAfterSeconds: auth.retryAfterSeconds },
      { status: 429 }
    );
  }
  return NextResponse.json(
    { error: "Unauthorized", attemptsRemaining: auth.attemptsRemaining },
    { status: 401 }
  );
}

// Validates and coerces a raw offer object from the request body. Returns
// null for anything unusable so the caller can drop it instead of saving
// garbage into Redis. Preserves an existing `id` if the caller sends one
// (an offer being kept as-is across an edit) and mints a fresh one only for
// genuinely new offers — this is what keeps per-offer order history and
// stats attached to the same offer across reorders/label edits.
function parseOffer(raw: any): ProductOffer | null {
  if (!raw || (raw.providerId !== "provider1" && raw.providerId !== "provider2")) return null;
  if (!raw.catalogItemId && !raw.catalogProductId) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `off-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    providerId: raw.providerId,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined,
    countryId: Number(raw.countryId) || 0,
    platformId: Number(raw.platformId) || 0,
    catalogProductId: Number(raw.catalogProductId) || 0,
    catalogItemId: Number(raw.catalogItemId) || 0,
    displayPrice: raw.displayPrice || "0",
  };
}

export async function GET(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    const auth = await checkAdminAuth(req, pw);
    const denied = lockedOrUnauthorized(auth);
    if (denied) return denied;

    const data = await redis.hgetall<Record<string, unknown>>(PRODUCTS_KEY);
    const products: Product[] = [];
    if (data) {
      for (const val of Object.values(data)) {
        const raw = parseHashValue<any>(val);
        if (raw) products.push(normalizeProduct(raw));
      }
    }
    return NextResponse.json({ success: true, products });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    const auth = await checkAdminAuth(req, pw);
    const denied = lockedOrUnauthorized(auth);
    if (denied) return denied;

    const body = await req.json();

    if (!body.name || body.name.trim() === "") {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    // Accepts either the new `offers[]` array, or the old single-offer
    // fields (kept working for any script/integration still using them) —
    // folded into a one-item offers[] the same way normalizeProduct() does
    // for records already sitting in Redis.
    const rawOffers: any[] = Array.isArray(body.offers)
      ? body.offers
      : body.catalogItemId || body.catalogProductId
      ? [{ providerId: "provider1", ...body }]
      : [];
    const offers = rawOffers.map(parseOffer).filter((o): o is ProductOffer => o !== null);

    const product: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: body.name.trim(),
      country: body.country?.trim() || "Unknown",
      active: true,
      createdAt: new Date().toISOString(),
      offers,
    };

    await redis.hset(PRODUCTS_KEY, { [product.id]: JSON.stringify(product) });

    return NextResponse.json({ success: true, product });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    const auth = await checkAdminAuth(req, pw);
    const denied = lockedOrUnauthorized(auth);
    if (denied) return denied;

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });

    const raw = await redis.hget<string>(PRODUCTS_KEY, body.id);
    if (!raw) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const existing = normalizeProduct(typeof raw === "string" ? JSON.parse(raw) : raw);

    // Every field here is optional and only overwrites what's actually
    // provided — `offers` in particular REPLACES the whole array (like the
    // vouchers PATCH endpoint does with productIds), so the caller sends the
    // full desired list, not a delta.
    const updated: Product = {
      ...existing,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
      country: typeof body.country === "string" && body.country.trim() ? body.country.trim() : existing.country,
      active: typeof body.active === "boolean" ? body.active : existing.active,
      offers: Array.isArray(body.offers)
        ? body.offers.map((o: any) => parseOffer(o)).filter((o: ProductOffer | null): o is ProductOffer => o !== null)
        : existing.offers,
    };

    await redis.hset(PRODUCTS_KEY, { [updated.id]: JSON.stringify(updated) });
    return NextResponse.json({ success: true, product: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    const auth = await checkAdminAuth(req, pw);
    const denied = lockedOrUnauthorized(auth);
    if (denied) return denied;

    const { id } = await req.json();
    await redis.hdel(PRODUCTS_KEY, id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
