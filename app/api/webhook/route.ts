export const dynamic = 'force-dynamic';

import { NextRequest } from "next/server";
import { handleProviderWebhook } from "@/lib/webhook";

// Backward-compatible default endpoint — treated as Provider 1's webhook, so
// whatever URL was already configured on your original SMSCode account
// keeps working unchanged after this update. Point Provider 2's webhook
// setting at /api/webhook/provider2 instead (see /api/webhook/[providerId]).
export async function POST(req: NextRequest) {
  return handleProviderWebhook(req, "provider1");
}
