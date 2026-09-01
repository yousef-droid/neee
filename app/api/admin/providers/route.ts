export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { PROVIDERS, getProviderClient } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password") || "";
  const auth = await checkAdminAuth(req, pw);
  if (!auth.ok) {
    if (auth.locked) {
      return NextResponse.json({ error: "locked", retryAfterSeconds: auth.retryAfterSeconds }, { status: 429 });
    }
    return NextResponse.json({ error: "Unauthorized", attemptsRemaining: auth.attemptsRemaining }, { status: 401 });
  }

  // Balance is best-effort — the upstream endpoint's exact response shape
  // isn't something this app has relied on before now, so a provider whose
  // account doesn't return what we expect just shows "unavailable" instead
  // of breaking the whole tab.
  const providers = await Promise.all(
    PROVIDERS.map(async p => {
      if (!p.apiKey) {
        return { id: p.id, name: p.name, configured: false, balance: null, balanceError: null };
      }
      try {
        const res = await getProviderClient(p.id).getBalance();
        const balance = res?.data?.amount ?? res?.data?.balance ?? res?.amount ?? res?.balance ?? null;
        return { id: p.id, name: p.name, configured: true, balance, balanceError: balance === null ? "Unrecognized response" : null };
      } catch (err: any) {
        return { id: p.id, name: p.name, configured: true, balance: null, balanceError: err.message || "Could not fetch balance" };
      }
    })
  );

  return NextResponse.json({ success: true, providers });
}
