"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Phone, MapPin, ArrowLeft, Copy, Check, X, RefreshCw, Loader2, ShoppingCart, Ticket } from "lucide-react";
import Link from "next/link";

interface OrderData {
  id: string;
  phoneNumber: string;
  status: string;
  otpCode: string | null;
  otpMessage: string | null;
  otpHistory: { code: string | null; message: string | null; receivedAt: string }[];
  amountUsd: string;
  messageCount: number;
  canReactivate: boolean;
  createdAt: string;
  expiresAt: string | null;
  voucherCode: string | null;
  providerId?: string;
  offerId?: string | null;
}

interface ProductOffer {
  id: string;
  providerId: string;
  label?: string;
}

const MIN_HOLD_SECONDS = 120;
// Numbers are only guaranteed to stay valid for this long. We use the
// provider's own expiresAt when we have it, and fall back to this from
// creation time for the rare case it isn't set yet.
const DEFAULT_VALIDITY_SECONDS = 20 * 60;

const STATUS_LABELS: Record<string, string> = {
  active: "Waiting",
  otp_received: "Code Received",
  canceled: "Canceled",
  completed: "Completed",
  expired: "Expired",
  burned: "Burned",
};

export default function NumberPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<any>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Redemption code state — either arrives via ?code= from the home page,
  // or the customer types one in right here.
  const [code, setCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Which specific offer (listing) the customer picked, when the product
  // has more than one. Auto-filled once the product loads if there's only
  // one — no need to make the customer choose between exactly one thing.
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");

  // Cancel button state
  const [now, setNow] = useState(Date.now());
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const p = d.products.find((x: any) => x.id === productId);
          if (p) {
            setProduct(p);
            // Only one way to get this number — no need to make the
            // customer choose, just use it.
            if (p.offers && p.offers.length === 1) setSelectedOfferId(p.offers[0].id);
          }
        }
      });
  }, [productId]);

  const verifyCode = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setVerifying(true);
    setCodeError("");
    const r = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value, productId }),
    });
    const d = await r.json();
    if (d.success) {
      // This code already has a different number in progress — jump
      // straight there instead of showing this (wrong) product page.
      if (d.existingProductId && d.existingProductId !== productId) {
        window.location.href = `/number/${d.existingProductId}?code=${encodeURIComponent(d.voucher.code)}`;
        return;
      }
      setVerifying(false);
      setCodeVerified(true);
    } else {
      setVerifying(false);
      setCodeVerified(false);
      setCodeError(d.error || "Invalid code");
    }
  }, [productId]);

  // Pick up ?code= from the URL (e.g. coming from the home page redeem flow).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode) {
      setCode(urlCode.toUpperCase());
      verifyCode(urlCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const pollOrder = useCallback(async (orderId: string) => {
    const r = await fetch(`/api/orders/${orderId}`);
    const d = await r.json();
    if (d.success) {
      setOrder(d.order);
      // "otp_received" is NOT a stopping point — the number keeps listening
      // and another message (another OTP) can still land on it before it
      // expires or the customer marks it done. Only stop on states where
      // nothing more will ever happen.
      if (["canceled", "expired", "completed", "burned"].includes(d.order.status)) {
        setPolling(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!polling || !order) return;
    const iv = setInterval(() => pollOrder(order.id), 3000);
    return () => clearInterval(iv);
  }, [polling, order, pollOrder]);

  // Live countdown for the cancel button's 2-minute hold.
  useEffect(() => {
    if (!order || (order.status !== "active" && order.status !== "otp_received")) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [order?.status, order?.id]);

  const secondsSinceCreated = order ? (now - new Date(order.createdAt).getTime()) / 1000 : 0;
  const cancelUnlockIn = order ? Math.max(0, Math.ceil(MIN_HOLD_SECONDS - secondsSinceCreated)) : 0;

  // Countdown until this number's validity runs out. Prefer the provider's
  // own expiresAt (it's the real deadline); fall back to a 20-minute window
  // from creation if that isn't set yet.
  const expiresAtMs = order
    ? order.expiresAt
      ? new Date(order.expiresAt).getTime()
      : new Date(order.createdAt).getTime() + DEFAULT_VALIDITY_SECONDS * 1000
    : 0;
  const totalValiditySeconds = order
    ? Math.max(1, (expiresAtMs - new Date(order.createdAt).getTime()) / 1000)
    : DEFAULT_VALIDITY_SECONDS;
  const secondsUntilExpiry = order ? Math.max(0, Math.round((expiresAtMs - now) / 1000)) : 0;
  const expiryMinutes = Math.floor(secondsUntilExpiry / 60);
  const expirySeconds = secondsUntilExpiry % 60;
  const expiryPercent = Math.min(100, Math.max(0, (secondsUntilExpiry / totalValiditySeconds) * 100));
  const expiredButUnsynced = order ? (order.status === "active" || order.status === "otp_received") && secondsUntilExpiry <= 0 : false;
  const expiredCodeReusable = order ? order.status === "expired" && !order.otpCode : false;

  const handleBuy = async () => {
    if (!codeVerified) return;
    if (needsOfferChoice && !selectedOfferId) return;
    setLoading(true);
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, code, offerId: selectedOfferId }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) {
      setOrder(d.order);
      setPolling(d.order.status === "active" || d.order.status === "otp_received");
    } else {
      alert(d.error || "Failed to create the order");
    }
  };

  const handleCancel = async () => {
    if (!order || cancelUnlockIn > 0) return;
    if (!confirm("Are you sure you want to cancel this number?")) return;
    setCanceling(true);
    setCancelError("");
    const r = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" });
    const d = await r.json();
    setCanceling(false);
    if (d.success) {
      setPolling(false);
      const codeUsed = order.voucherCode || code;
      const reusable = d.codeReusable ? "1" : "0";
      router.push(`/?canceled=1&code=${encodeURIComponent(codeUsed || "")}&reusable=${reusable}`);
    } else if (d.error === "TOO_EARLY") {
      setCancelError(`You can cancel this number in ${d.retryAfterSeconds}s.`);
    } else {
      setCancelError(d.error || "Could not cancel this number right now.");
    }
  };

  const handleFinish = async () => {
    if (!order) return;
    const r = await fetch(`/api/orders/${order.id}/finish`, { method: "POST" });
    const d = await r.json();
    if (d.success) {
      setOrder({ ...order, status: "completed" });
      setPolling(false);
    }
  };

  const handleReactivate = async () => {
    if (!order) return;
    setLoading(true);
    const r = await fetch(`/api/orders/${order.id}/reactivate`, { method: "POST" });
    const d = await r.json();
    setLoading(false);
    if (d.success) {
      setOrder(d.order);
      setPolling(true);
    }
  };

  const copyCode = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedCode(value);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Older orders (created before we started keeping otpHistory) won't have
  // it — fall back to just showing whatever single code/message they have.
  const receivedMessages: { code: string | null; message: string | null }[] = order
    ? order.otpHistory && order.otpHistory.length > 0
      ? order.otpHistory
      : order.otpCode || order.otpMessage
      ? [{ code: order.otpCode, message: order.otpMessage }]
      : []
    : [];

  const offers: ProductOffer[] = product?.offers || [];
  const needsOfferChoice = offers.length > 1;

  if (!product) {
    return (
      <main className="min-h-screen bg-dark">
        <Header />
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-primary" size={40} /></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-red-primary transition-colors mb-6">
          <ArrowLeft size={18} />Back to numbers
        </Link>

        <div className="bg-darker border border-red-dark/20 rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-red-primary/10 rounded-2xl flex items-center justify-center">
              <Phone className="text-red-primary" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{product.name}</h1>
              <p className="text-gray-500 flex items-center gap-1"><MapPin size={14} />{product.country}</p>
            </div>
          </div>

          {!order ? (
            <div className="space-y-4">
              {!codeVerified ? (
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">Enter the code you bought from our admin or a reseller to get this number.</p>
                  <div className="flex gap-2">
                    <input
                      value={code}
                      onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
                      placeholder="Enter your code"
                      className="flex-1 px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-red-primary"
                    />
                    <button
                      onClick={() => verifyCode(code)}
                      disabled={verifying || !code.trim()}
                      className="px-6 py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {verifying ? <Loader2 className="animate-spin" size={18} /> : <><Ticket size={18} />Apply</>}
                    </button>
                  </div>
                  {codeError && <p className="text-red-400 text-sm">{codeError}</p>}
                  <Link href="/" className="text-red-primary text-sm hover:underline inline-block">Don't have a code yet? Get one from the home page</Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-dark/30 rounded-xl border border-green-500/30">
                    <span className="text-gray-400">Code</span>
                    <span className="text-green-400 font-bold flex items-center gap-2"><Check size={16} />{code}</span>
                  </div>

                  {needsOfferChoice && (
                    <div className="space-y-2">
                      <p className="text-gray-400 text-sm">This service has more than one option — pick one:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {offers.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setSelectedOfferId(o.id)}
                            className={`px-4 py-3 rounded-xl border text-left transition-all ${
                              selectedOfferId === o.id
                                ? "bg-red-primary/10 border-red-primary text-white"
                                : "bg-dark/50 border-red-dark/20 text-gray-400 hover:border-red-primary/50"
                            }`}
                          >
                            <span className="font-bold block">{o.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleBuy}
                    disabled={loading || (needsOfferChoice && !selectedOfferId)}
                    className="w-full py-4 rounded-xl font-bold text-lg bg-red-primary hover:bg-red-light text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <><ShoppingCart size={20} />Get This Number</>}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-dark/50 rounded-xl p-6 text-center border border-red-primary/30">
                <p className="text-gray-400 text-sm mb-2">Number</p>
                <p className="text-3xl font-mono font-bold">{order.phoneNumber || "Loading..."}</p>
                {needsOfferChoice && (
                  <p className="text-gray-600 text-xs mt-2">
                    via {offers.find(o => o.id === order.offerId)?.label || "—"}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-dark/30 rounded-xl">
                <span className="text-gray-400">Status</span>
                <span className={`font-bold ${
                  order.status === "otp_received" ? "text-green-400" :
                  order.status === "active" ? "text-yellow-400" :
                  order.status === "canceled" ? "text-gray-400" :
                  "text-red-400"
                }`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              {(order.status === "active" || order.status === "otp_received") && (
                <div className="p-4 bg-dark/30 rounded-xl border border-red-dark/20">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">Number expires in</span>
                    <span className={`font-mono font-bold ${secondsUntilExpiry <= 60 ? "text-red-400" : "text-white"}`}>
                      {expiredButUnsynced ? "0:00" : `${expiryMinutes}:${expirySeconds.toString().padStart(2, "0")}`}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${secondsUntilExpiry <= 60 ? "bg-red-500" : "bg-red-primary"}`}
                      style={{ width: `${expiredButUnsynced ? 0 : expiryPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {polling && (
                <div className="text-center p-4 bg-red-primary/5 rounded-xl border border-red-primary/20">
                  <p className="text-gray-400 text-sm mb-1">
                    {order.status === "otp_received" ? "Listening for another message..." : "Waiting for message..."}
                  </p>
                  <div className="flex justify-center"><Loader2 className="animate-spin text-red-primary" size={24} /></div>
                </div>
              )}

              {(order.status === "active" || order.status === "otp_received") && (
                <p className="text-gray-500 text-xs text-center px-2">
                  💡 Not getting a code? Once the hold period ends you can cancel this number and pull a new one with the same code — at no extra cost.
                </p>
              )}

              {order.status === "expired" && (
                <div className="text-center p-5 bg-dark/30 rounded-xl border border-yellow-500/30 space-y-3">
                  <p className="text-yellow-400 font-bold">This number's time ran out{order.otpCode ? "" : " before it received a code"}.</p>
                  {expiredCodeReusable ? (
                    <>
                      <p className="text-gray-400 text-sm">Your code hasn't been used up — grab a new number with it.</p>
                      <Link
                        href={`/?canceled=1&code=${encodeURIComponent(order.voucherCode || code || "")}&reusable=1`}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-red-primary hover:bg-red-light text-white transition-all"
                      >
                        Get another number
                      </Link>
                    </>
                  ) : (
                    <p className="text-gray-400 text-sm">This code has already been used and can't be reused.</p>
                  )}
                </div>
              )}

              {receivedMessages.length > 0 && (
                <div className="space-y-3">
                  {receivedMessages.length > 1 && (
                    <p className="text-gray-500 text-xs px-1">{receivedMessages.length} codes received on this number:</p>
                  )}
                  {receivedMessages.slice().reverse().map((entry, i) => (
                    <div key={i}>
                      {entry.code ? (
                        <div className="bg-dark/50 rounded-xl p-6 text-center border border-green-500/30">
                          {receivedMessages.length > 1 && (
                            <p className="text-gray-600 text-xs mb-2">{i === 0 ? "Latest" : `#${receivedMessages.length - i}`}</p>
                          )}
                          <p className="text-gray-400 text-sm mb-2">OTP Code</p>
                          <div className="flex items-center justify-center gap-3">
                            <code className="text-2xl font-mono font-bold text-green-400">{entry.code}</code>
                            <button onClick={() => copyCode(entry.code!)} className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 transition-colors">
                              {copiedCode === entry.code ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-green-400" />}
                            </button>
                          </div>
                        </div>
                      ) : entry.message ? (
                        <div className="bg-dark/50 rounded-xl p-4 border border-yellow-500/30">
                          <p className="text-gray-400 text-sm mb-1">Message:</p>
                          <p className="text-yellow-400 text-sm">{entry.message}</p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {order.status === "otp_received" && (
                  <>
                    <button onClick={handleReactivate} disabled={loading} className="py-3 rounded-xl bg-red-primary/10 border border-red-primary/30 text-red-primary hover:bg-red-primary/20 transition-all flex items-center justify-center gap-2">
                      {loading ? <Loader2 className="animate-spin" size={18} /> : <><RefreshCw size={18} />Send Again</>}
                    </button>
                    <button onClick={handleFinish} className="py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-all flex items-center justify-center gap-2">
                      <Check size={18} />Done
                    </button>
                  </>
                )}
              </div>

              {(order.status === "active" || order.status === "otp_received") && (
                cancelUnlockIn > 0 ? (
                  <button disabled className="w-full py-3 rounded-xl bg-gray-800/50 text-gray-500 transition-all flex items-center justify-center gap-2 cursor-not-allowed">
                    <X size={18} />Cancel available in {cancelUnlockIn}s
                  </button>
                ) : (
                  <button onClick={handleCancel} disabled={canceling} className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 transition-all flex items-center justify-center gap-2">
                    {canceling ? <Loader2 className="animate-spin" size={18} /> : <><X size={18} />Cancel Number</>}
                  </button>
                )
              )}
              {cancelError && <p className="text-red-400 text-sm text-center">{cancelError}</p>}
            </div>
          )}

          <p className="text-gray-600 text-xs text-center pt-5 mt-5 border-t border-red-dark/10">
            🤝 Something not working right? Message me from wherever you bought your code, tell me what happened, and I'll get it fixed.
          </p>
        </div>
      </div>
    </main>
  );
}
