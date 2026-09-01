export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { handleProviderWebhook } from "@/lib/webhook";

// Point a provider's webhook setting at /api/webhook/provider1 or
// /api/webhook/provider2 (matching lib/providers.ts) so incoming
// "otp_received" events get matched against the right provider's order
// index. Provider 1 also still works at the bare /api/webhook URL.
export async function POST(req: NextRequest, { params }: { params: { providerId: string } }) {
  return handleProviderWebhook(req, params.providerId);
}
