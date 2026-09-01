export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getProviderClient, resolveProviderId } from "@/lib/providers";

export async function GET(req: NextRequest) {
  try {
    const providerId = resolveProviderId(req.nextUrl.searchParams.get("providerId"));
    const client = getProviderClient(providerId);

    const type = req.nextUrl.searchParams.get("type");
    if (type === "countries") {
      const res = await client.getCountries();
      return NextResponse.json(res);
    }
    if (type === "services") {
      const countryId = Number(req.nextUrl.searchParams.get("countryId"));
      const res = await client.getServices(countryId);
      return NextResponse.json(res);
    }
    if (type === "products") {
      const countryId = Number(req.nextUrl.searchParams.get("countryId"));
      const platformId = Number(req.nextUrl.searchParams.get("platformId"));
      const res = await client.getProducts(countryId, platformId);
      return NextResponse.json(res);
    }
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
