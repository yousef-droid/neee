"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Phone, MapPin, ShoppingCart, ArrowRight, Loader2, Ticket, Info, Shield } from "lucide-react";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  country: string;
  offerCount: number;
}

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemedOptions, setRedeemedOptions] = useState<{ code: string; options: Product[] } | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then(r => r.json())
      .then(d => { if (d.success) setProducts(d.products); })
      .finally(() => setLoading(false));
  }, []);

  // Pick up the "your number was canceled" redirect from the number page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "1") {
      const codeParam = params.get("code") || "";
      const reusable = params.get("reusable") === "1";
      setBanner({
        type: reusable ? "success" : "info",
        text: reusable
          ? `Your number was canceled. Since no message was received, your code${codeParam ? ` (${codeParam})` : ""} hasn't been used up — enter it again below to get a new number.`
          : "Your number was canceled.",
      });
      if (codeParam) setVoucherCode(codeParam);
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRedeem = async () => {
    if (!voucherCode.trim()) return;
    setRedeeming(true);
    setRedeemedOptions(null);
    const r = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: voucherCode }),
    });
    const d = await r.json();
    setRedeeming(false);
    if (d.success) {
      const codeValue = d.voucher.code;
      // This code already has a number in progress — go straight back to it,
      // no need to pick again.
      if (d.existingProductId) {
        window.location.href = `/number/${d.existingProductId}?code=${encodeURIComponent(codeValue)}`;
        return;
      }
      const ids: string[] = d.voucher.productIds || [];
      if (ids.length === 1) {
        window.location.href = `/number/${ids[0]}?code=${encodeURIComponent(codeValue)}`;
        return;
      }
      // Empty productIds is a deliberate "works for any service" code, not
      // an incomplete one — offer every current product in that case.
      const options = ids.length === 0 ? products : products.filter(p => ids.includes(p.id));
      setRedeemedOptions({ code: codeValue, options });
    } else {
      alert(d.error || "Invalid code");
    }
  };

  const filtered = filter === "all" ? products : products.filter(p => p.country === filter);
  const countries = Array.from(new Set(products.map(p => p.country)));

  return (
    <main className="min-h-screen bg-dark">
      <Header />
      <section className="relative overflow-hidden py-16 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-red-primary/5 to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-primary/10 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-4 text-glow">QuickSellPro <span className="text-red-primary">SMS</span> Numbers</h1>
          <p className="text-gray-400 text-lg mb-8">Get instant phone numbers for Blizzard verification and more services</p>

          {banner && (
            <div className={`max-w-lg mx-auto mb-6 px-4 py-3 rounded-xl border text-sm font-medium text-left ${
              banner.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-blue-500/10 border-blue-500/30 text-blue-300"
            }`}>
              {banner.text}
            </div>
          )}

          {/* Code Redeem */}
          <div className="bg-darker border border-red-dark/30 rounded-2xl p-6 mb-8 max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-3 text-red-primary">
              <Ticket size={20} />
              <span className="font-bold">Have a code?</span>
            </div>
            <div className="flex gap-2">
              <input
                value={voucherCode}
                onChange={e => setVoucherCode(e.target.value)}
                placeholder="Enter your code (e.g. ABC123)"
                className="flex-1 px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-red-primary"
              />
              <button
                onClick={handleRedeem}
                disabled={redeeming}
                className="px-6 py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {redeeming ? "..." : "Redeem"}
              </button>
            </div>
          </div>

          {redeemedOptions && (
            <div className="bg-darker border border-green-500/30 rounded-2xl p-6 mb-8 max-w-lg mx-auto text-left">
              <p className="text-green-400 font-bold mb-3">
                Your code works for {redeemedOptions.options.length} service{redeemedOptions.options.length === 1 ? "" : "s"} — pick one:
              </p>
              <div className="space-y-2">
                {redeemedOptions.options.map(p => (
                  <Link
                    key={p.id}
                    href={`/number/${p.id}?code=${encodeURIComponent(redeemedOptions.code)}`}
                    className="flex items-center justify-between px-4 py-3 bg-dark/50 rounded-xl hover:bg-red-primary/10 border border-red-dark/20 transition-all"
                  >
                    <span className="flex items-center gap-2"><MapPin size={14} className="text-gray-500" />{p.name}</span>
                    <ArrowRight size={16} className="text-red-primary" />
                  </Link>
                ))}
                {redeemedOptions.options.length === 0 && (
                  <p className="text-gray-500 text-sm">None of the services on this code are available right now.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setFilter("all")} className={`px-6 py-2 rounded-full border transition-all ${filter === "all" ? "bg-red-primary border-red-primary text-white" : "border-red-dark/50 text-gray-400 hover:border-red-primary"}`}>All</button>
            {countries.map(c => (
              <button key={c} onClick={() => setFilter(c)} className={`px-6 py-2 rounded-full border transition-all flex items-center gap-2 ${filter === c ? "bg-red-primary border-red-primary text-white" : "border-red-dark/50 text-gray-400 hover:border-red-primary"}`}>
                <MapPin size={14} />{c}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* How it works + Rules */}
      <section className="max-w-4xl mx-auto px-4 pb-8">
        <div className="bg-darker/50 border border-red-dark/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4 text-red-primary">
            <Info size={20} />
            <h2 className="font-bold text-lg">How it works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400 mb-6">
            <div className="bg-dark/50 rounded-xl p-4">
              <div className="text-red-primary font-bold text-xl mb-2">1</div>
              <p>Buy a code from our admin or resellers</p>
            </div>
            <div className="bg-dark/50 rounded-xl p-4">
              <div className="text-red-primary font-bold text-xl mb-2">2</div>
              <p>Enter your code above to redeem your number</p>
            </div>
            <div className="bg-dark/50 rounded-xl p-4">
              <div className="text-red-primary font-bold text-xl mb-2">3</div>
              <p>Receive your SMS code instantly. One code = one number</p>
            </div>
          </div>

          <div className="border-t border-red-dark/20 pt-4">
            <div className="flex items-center gap-2 mb-3 text-green-400">
              <Shield size={18} />
              <h3 className="font-bold">Important Rules</h3>
            </div>
            <ul className="text-sm text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-red-primary mt-1">•</span>
                <span><strong>One code = one number.</strong> Even if you receive multiple SMS messages on the same number, it still counts as one code.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-primary mt-1">•</span>
                <span><strong>Your code does NOT burn</strong> until a message is actually received. If you cancel before receiving a message, you can reuse the same code.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-primary mt-1">•</span>
                <span><strong>Need another message?</strong> Use "Send Again" to request another SMS on the same number (still uses the same code).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-primary mt-1">•</span>
                <span><strong>Covers more than one service?</strong> If your code is valid for several services or countries, you'll get to pick which one to use it on when you redeem it.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-primary" size={40} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(p => (
              <div key={p.id} className="group relative bg-darker border border-red-dark/20 rounded-2xl p-6 hover:border-red-primary/50 transition-all duration-300 hover:glow-red">
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/30">Available</span>
                  {p.offerCount > 1 && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">{p.offerCount} providers</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-primary/10 rounded-xl flex items-center justify-center"><Phone className="text-red-primary" size={24} /></div>
                  <div>
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <p className="text-gray-500 text-sm flex items-center gap-1"><MapPin size={12} />{p.country}</p>
                  </div>
                </div>
                <Link href={`/number/${p.id}`} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-red-primary hover:bg-red-light text-white transition-all">
                  <ShoppingCart size={18} />Get Number<ArrowRight size={18} />
                </Link>
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-xl mb-4">No products available yet</p>
            <Link href="/admin" className="text-red-primary hover:underline">Go to Admin to add products</Link>
          </div>
        )}
      </section>
    </main>
  );
}
