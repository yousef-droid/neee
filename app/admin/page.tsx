"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  Shield, Plus, Trash2, History, Server, Flame, Clock, CheckCircle, XCircle,
  LogOut, BarChart3, Loader2, Gamepad2, Ticket, MapPin, Archive, RotateCcw,
  ChevronUp, ChevronDown,
} from "lucide-react";

interface ProductOffer {
  id: string;
  providerId: string;
  label?: string;
  countryId: number;
  platformId: number;
  catalogProductId: number;
  catalogItemId: number;
  displayPrice?: string;
}
interface Product {
  id: string;
  name: string;
  country: string;
  active: boolean;
  createdAt: string;
  offers: ProductOffer[];
}
interface Order {
  id: string;
  productId: string;
  providerId?: string;
  offerId?: string | null;
  phoneNumber: string;
  status: string;
  otpCode: string | null;
  otpReceivedAt: string | null;
  amountUsd: string;
  createdAt: string;
  messageCount: number;
  voucherCode: string | null;
  archived?: boolean;
}
interface Voucher {
  id: string; code: string; productIds: string[]; used: boolean; usedAt?: string; createdAt: string;
}
interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  balance: any;
  balanceError: string | null;
}

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "—";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Shared catalog-browsing + offer list editor, used both when creating a
// brand-new product and when adding/removing offers on an existing one. The
// caller decides what onAdd/onRemove actually do (hold state locally for a
// not-yet-saved product, or PATCH an existing one straight away).
function OfferBuilder({
  providers,
  offers,
  onAdd,
  onRemove,
  onMove,
  offerStats,
}: {
  providers: ProviderInfo[];
  offers: ProductOffer[];
  onAdd: (offer: Omit<ProductOffer, "id">) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  // Per-offer performance, keyed by offer id — only available once a
  // product has actually been saved and has real orders against it, so
  // this is omitted entirely for a not-yet-created product.
  offerStats?: Record<string, { pulled: number; successRate: number | null; lastReceivedAt: string | null }>;
}) {
  const [providerId, setProviderId] = useState<string>(providers.find(p => p.configured)?.id || "provider1");
  const [countries, setCountries] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [selCountry, setSelCountry] = useState("");
  const [selService, setSelService] = useState("");
  const [selProduct, setSelProduct] = useState("");
  const [label, setLabel] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);

  const resetSelections = () => {
    setCountries([]); setServices([]); setCatalogProducts([]);
    setSelCountry(""); setSelService(""); setSelProduct("");
    setCatalogError("");
  };

  const fetchCountries = async (forProviderId: string) => {
    setCatalogError(""); setCatalogLoading(true);
    try {
      const r = await fetch(`/api/catalog?type=countries&providerId=${forProviderId}`);
      const d = await r.json();
      setCatalogLoading(false);
      if (d.success) setCountries(d.data);
      else setCatalogError(d.error || "Could not load countries from the catalog.");
    } catch {
      setCatalogLoading(false);
      setCatalogError("Could not reach the catalog. Check your connection and try again.");
    }
  };

  const fetchServices = async (countryId: number) => {
    setCatalogError(""); setCatalogLoading(true);
    try {
      const r = await fetch(`/api/catalog?type=services&countryId=${countryId}&providerId=${providerId}`);
      const d = await r.json();
      setCatalogLoading(false);
      if (d.success) setServices(d.data);
      else setCatalogError(d.error || "Could not load services for this country.");
    } catch {
      setCatalogLoading(false);
      setCatalogError("Could not reach the catalog. Check your connection and try again.");
    }
  };

  const fetchCatalogProducts = async (countryId: number, platformId: number) => {
    setCatalogError(""); setCatalogLoading(true);
    try {
      const r = await fetch(`/api/catalog?type=products&countryId=${countryId}&platformId=${platformId}&providerId=${providerId}`);
      const d = await r.json();
      setCatalogLoading(false);
      if (d.success) setCatalogProducts(d.data);
      else setCatalogError(d.error || "Could not load products for this service.");
    } catch {
      setCatalogLoading(false);
      setCatalogError("Could not reach the catalog. Check your connection and try again.");
    }
  };

  const switchProvider = (id: string) => {
    setProviderId(id);
    resetSelections();
    const p = providers.find(pp => pp.id === id);
    if (p?.configured) fetchCountries(id);
  };

  useEffect(() => {
    const p = providers.find(pp => pp.id === providerId);
    if (p?.configured) fetchCountries(providerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCatalogProduct = selProduct !== "" ? catalogProducts[Number(selProduct)] : null;
  const providerName = (id: string) => providers.find(p => p.id === id)?.name || id;

  const handleAddOffer = () => {
    if (!selectedCatalogProduct) return;
    onAdd({
      providerId,
      label: label.trim() || undefined,
      countryId: selectedCatalogProduct.country_id,
      platformId: selectedCatalogProduct.platform_id,
      catalogProductId: selectedCatalogProduct.catalog_product_id,
      catalogItemId: selectedCatalogProduct.id,
    });
    setSelProduct(""); setLabel("");
  };

  return (
    <div className="space-y-4">
      {offers.length > 0 && (
        <div className="space-y-2">
          {offers.map((o, i) => {
            const stats = offerStats?.[o.id];
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-dark border border-red-dark/30 rounded-xl text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{o.label || providerName(o.providerId)}</span>
                  <span className="text-gray-500">· {providerName(o.providerId)} · Item {o.catalogItemId}</span>
                  {stats && (
                    <span className="text-gray-500">
                      · {stats.pulled === 0 ? "no orders yet" : `${stats.successRate}% received a code`}
                      {stats.lastReceivedAt ? ` · last code ${timeAgo(stats.lastReceivedAt)}` : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => onMove(i, "up")} title="Move up" className="p-1.5 rounded-lg bg-dark border border-red-dark/30 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronUp size={14} /></button>
                  <button type="button" disabled={i === offers.length - 1} onClick={() => onMove(i, "down")} title="Move down" className="p-1.5 rounded-lg bg-dark border border-red-dark/30 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronDown size={14} /></button>
                  <button type="button" onClick={() => onRemove(i)} title="Remove" className="p-1.5 rounded-lg text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          <p className="text-gray-500 text-xs">This is the order customers will see them in — use the arrows to rearrange.</p>
        </div>
      )}

      <div className="bg-dark/30 border border-red-dark/20 rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {providers.map(p => (
            <button
              key={p.id}
              type="button"
              disabled={!p.configured}
              onClick={() => switchProvider(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                providerId === p.id ? "bg-red-primary text-white" : "bg-dark text-gray-400 border border-red-dark/30"
              }`}
            >
              {p.name}{!p.configured ? " (not set up)" : ""}
            </button>
          ))}
        </div>
        <p className="text-gray-500 text-xs -mt-1">You can add as many offers from the same provider as you like — e.g. different tiers or listings.</p>

        {!providers.find(p => p.id === providerId)?.configured ? (
          <p className="text-yellow-500 text-sm">Add this provider's API key in your environment variables to browse its catalog.</p>
        ) : (
          <>
            {catalogLoading && <p className="text-gray-500 text-sm">Loading catalog...</p>}
            {catalogError && <p className="text-red-400 text-sm">{catalogError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={selCountry}
                onChange={e => {
                  const v = e.target.value;
                  setSelCountry(v); setSelService(""); setSelProduct(""); setServices([]); setCatalogProducts([]);
                  if (v) fetchServices(Number(v));
                }}
                className="px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white"
              >
                <option value="">Select country</option>
                {countries.map((c: any) => <option key={c.id} value={c.id}>{c.emoji} {c.name} (ID: {c.id})</option>)}
              </select>
              <select
                value={selService}
                disabled={!selCountry}
                onChange={e => {
                  const v = e.target.value;
                  setSelService(v); setSelProduct(""); setCatalogProducts([]);
                  if (v && selCountry) fetchCatalogProducts(Number(selCountry), Number(v));
                }}
                className="px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white disabled:opacity-50"
              >
                <option value="">{selCountry ? "Select service" : "Select a country first"}</option>
                {services.map((s: any) => <option key={s.id} value={s.id}>{s.name} (ID: {s.id})</option>)}
              </select>
              <select value={selProduct} disabled={!selService} onChange={e => setSelProduct(e.target.value)} className="px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white disabled:opacity-50">
                <option value="">{!selCountry ? "Select a country first" : !selService ? "Select a service first" : catalogProducts.length === 0 ? "No products found" : "Select product"}</option>
                {catalogProducts.map((p: any, i: number) => <option key={`${p.id}-${i}`} value={i}>{p.name} (Item ID: {p.id} · Catalog ID: {p.catalog_product_id})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder={`Label shown to customer (optional — auto-numbered if left blank)`} className="px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600" />
            </div>
            <button type="button" onClick={handleAddOffer} disabled={!selectedCatalogProduct} className="px-6 py-2 bg-red-primary/10 border border-red-primary/30 text-red-primary rounded-xl font-bold hover:bg-red-primary/20 transition-all disabled:opacity-40">
              + Add this as an offer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"products" | "vouchers" | "providers" | "orders">("products");
  const [showAdd, setShowAdd] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formName, setFormName] = useState("");
  const [formCountry, setFormCountry] = useState("");
  const [addError, setAddError] = useState("");
  const [newProductOffers, setNewProductOffers] = useState<ProductOffer[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const [voucherCode, setVoucherCode] = useState("");
  const [voucherProductIds, setVoucherProductIds] = useState<string[]>([]);
  const [voucherBulkMode, setVoucherBulkMode] = useState(false);
  const [voucherCodes, setVoucherCodes] = useState("");
  const [voucherAnyService, setVoucherAnyService] = useState(false);
  const [voucherFormError, setVoucherFormError] = useState("");

  const [voucherSort, setVoucherSort] = useState<"newest" | "oldest">("newest");
  const [voucherStatusFilter, setVoucherStatusFilter] = useState<"all" | "available" | "used">("all");
  const [voucherServiceFilter, setVoucherServiceFilter] = useState<string>("all");

  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [showBulkEditServices, setShowBulkEditServices] = useState(false);
  const [bulkEditProductIds, setBulkEditProductIds] = useState<string[]>([]);
  const [bulkEditAnyService, setBulkEditAnyService] = useState(false);
  const [bulkEditError, setBulkEditError] = useState("");

  // --- Log (orders) tab: view, filters, sort, multi-select, date range ---
  const [logView, setLogView] = useState<"log" | "archived">("log");
  const [logSort, setLogSort] = useState<"newest" | "oldest">("newest");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("all");
  const [logProviderFilter, setLogProviderFilter] = useState<string>("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showDateRangeArchive, setShowDateRangeArchive] = useState(false);
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");

  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());

  const headers = { "x-admin-password": password };

  useEffect(() => {
    const saved = localStorage.getItem("qsp_admin_pw");
    if (saved) { setPassword(saved); setLoggedIn(true); }
  }, []);

  useEffect(() => { if (loggedIn) refresh(); }, [loggedIn]);

  // Live countdown while locked out.
  useEffect(() => {
    if (!lockedUntil) return;
    const iv = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  const remainingLockSeconds = lockedUntil ? Math.max(0, (lockedUntil - tick) / 1000) : 0;
  const isLocked = !!lockedUntil && remainingLockSeconds > 0;

  useEffect(() => {
    if (lockedUntil && remainingLockSeconds <= 0) {
      setLockedUntil(null);
      setLoginError("");
    }
  }, [remainingLockSeconds, lockedUntil]);

  const refresh = async () => {
    // Check products first (and only) before firing the other requests —
    // that way a stale saved password only ever counts as ONE failed
    // attempt per page load, not several at once.
    const pRes = await fetch("/api/admin/products", { headers: { "x-admin-password": password } });
    if (pRes.status === 429) {
      const d = await pRes.json().catch(() => ({} as any));
      handleLogout();
      const secs = d.retryAfterSeconds || 300;
      setLockedUntil(Date.now() + secs * 1000);
      setLoginError(`Too many failed attempts. Try again in ${formatCountdown(secs)}.`);
      return;
    }
    if (pRes.status === 401) {
      handleLogout();
      setLoginError("Wrong password");
      return;
    }
    const pData = await pRes.json();
    if (pData.success) setProducts(pData.products);

    const [oRes, vRes, provRes] = await Promise.all([
      fetch("/api/admin/orders", { headers: { "x-admin-password": password } }),
      fetch("/api/admin/vouchers", { headers: { "x-admin-password": password } }),
      fetch("/api/admin/providers", { headers: { "x-admin-password": password } }),
    ]);
    if ([oRes.status, vRes.status, provRes.status].some(s => s === 401 || s === 429)) {
      handleLogout();
      setLoginError("Wrong password");
      return;
    }
    const oData = await oRes.json();
    const vData = await vRes.json();
    const provData = await provRes.json();
    if (oData.success) setOrders(oData.orders);
    if (vData.success) setVouchers(vData.vouchers);
    if (provData.success) setProviders(provData.providers);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const r = await fetch("/api/admin/products", { headers: { "x-admin-password": password } });
      if (r.status === 429) {
        const d = await r.json().catch(() => ({} as any));
        const secs = d.retryAfterSeconds || 300;
        setLockedUntil(Date.now() + secs * 1000);
        setLoginError(`Too many failed attempts. Try again in ${formatCountdown(secs)}.`);
        return;
      }
      if (r.status === 401) {
        const d = await r.json().catch(() => ({} as any));
        setLoginError(
          typeof d.attemptsRemaining === "number"
            ? `Wrong password (${d.attemptsRemaining} attempt${d.attemptsRemaining === 1 ? "" : "s"} left)`
            : "Wrong password"
        );
        return;
      }
      if (!r.ok) {
        setLoginError("Server error, try again");
        return;
      }
      localStorage.setItem("qsp_admin_pw", password);
      setLoggedIn(true);
    } catch {
      setLoginError("Could not reach the server");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("qsp_admin_pw");
    setLoggedIn(false);
    setPassword("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!formName.trim()) {
      setAddError("Product name is required");
      return;
    }
    setLoading(true);
    const r = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: formName, country: formCountry, offers: newProductOffers }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) {
      setShowAdd(false);
      setFormName(""); setFormCountry(""); setNewProductOffers([]);
      refresh();
    } else {
      setAddError(d.error || "Failed to save");
    }
  };

  const handleAddOfferToProduct = async (product: Product, offer: Omit<ProductOffer, "id">) => {
    setLoading(true);
    const r = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: product.id, offers: [...product.offers, offer] }),
    });
    setLoading(false);
    if (r.ok) refresh(); else alert("Failed to add the offer");
  };

  const handleRemoveOfferFromProduct = async (product: Product, index: number) => {
    setLoading(true);
    const r = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: product.id, offers: product.offers.filter((_, i) => i !== index) }),
    });
    setLoading(false);
    if (r.ok) refresh(); else alert("Failed to remove the offer");
  };

  const handleMoveOfferInProduct = async (product: Product, index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= product.offers.length) return;
    const reordered = [...product.offers];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setLoading(true);
    const r = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id: product.id, offers: reordered }),
    });
    setLoading(false);
    if (r.ok) refresh(); else alert("Failed to reorder offers");
  };

  const makeTempOfferId = () => `off-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const moveNewOffer = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    setNewProductOffers(os => {
      if (newIndex < 0 || newIndex >= os.length) return os;
      const copy = [...os];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  };

  const handleAddVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setVoucherFormError("");
    const codes = voucherBulkMode
      ? Array.from(new Set(voucherCodes.split(/[\n,]+/).map(c => c.trim()).filter(Boolean)))
      : voucherCode.trim()
      ? [voucherCode.trim()]
      : [];
    if (codes.length === 0) {
      setVoucherFormError(voucherBulkMode ? "Enter at least one code" : "Code is required");
      return;
    }
    if (!voucherAnyService && voucherProductIds.length === 0) {
      setVoucherFormError('Pick at least one service, or check "Available for any service"');
      return;
    }
    setLoading(true);
    const r = await fetch("/api/admin/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ codes, productIds: voucherProductIds, anyService: voucherAnyService }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) {
      const createdCount: number = d.vouchers?.length ?? (d.voucher ? 1 : 0);
      const skipped: { code: string; reason: string }[] = d.skipped || [];
      setShowVoucher(false);
      setVoucherCode(""); setVoucherCodes(""); setVoucherProductIds([]);
      setVoucherAnyService(false); setVoucherBulkMode(false);
      refresh();
      if (skipped.length > 0) {
        alert(`Created ${createdCount} code${createdCount === 1 ? "" : "s"}. Skipped ${skipped.length} that already existed: ${skipped.map(s => s.code).join(", ")}`);
      }
    } else {
      setVoucherFormError(d.error || "Failed to create code(s)");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id }),
    });
    refresh();
  };

  const handleDeleteVoucher = async (id: string) => {
    if (!confirm("Delete this code?")) return;
    await fetch("/api/admin/vouchers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id }),
    });
    refresh();
  };

  const toggleVoucherProduct = (id: string) => {
    setVoucherProductIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const toggleVoucherSelection = (id: string) => {
    setSelectedVoucherIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const handleBulkEditServices = async () => {
    setBulkEditError("");
    if (!bulkEditAnyService && bulkEditProductIds.length === 0) {
      setBulkEditError('Pick at least one service, or check "Available for any service"');
      return;
    }
    setLoading(true);
    const r = await fetch("/api/admin/vouchers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ ids: selectedVoucherIds, productIds: bulkEditProductIds, anyService: bulkEditAnyService }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) {
      setShowBulkEditServices(false);
      setSelectedVoucherIds([]);
      setBulkEditProductIds([]);
      setBulkEditAnyService(false);
      refresh();
    } else {
      setBulkEditError(d.error || "Failed to update codes");
    }
  };

  const handleBulkDeleteVouchers = async () => {
    if (selectedVoucherIds.length === 0) return;
    if (!confirm(`Delete ${selectedVoucherIds.length} code${selectedVoucherIds.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setLoading(true);
    const r = await fetch("/api/admin/vouchers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ ids: selectedVoucherIds }),
    });
    setLoading(false);
    if (r.ok) {
      setSelectedVoucherIds([]);
      refresh();
    } else {
      alert("Failed to delete the selected codes");
    }
  };

  // --- Log tab: archive (soft-delete) / restore / permanent delete ---

  const archiveOrders = async (payload: { ids?: string[]; scope?: string; dateFrom?: string; dateTo?: string }) => {
    setLoading(true);
    const r = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) { setSelectedOrderIds([]); setShowDateRangeArchive(false); refresh(); }
    else alert(d.error || "Failed to archive");
  };

  const restoreOrders = async (ids: string[]) => {
    setLoading(true);
    const r = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ ids, unarchive: true }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) { setSelectedOrderIds([]); refresh(); }
    else alert(d.error || "Failed to restore");
  };

  const permanentlyDelete = async (payload: { ids?: string[]; scope?: string; dateFrom?: string; dateTo?: string }) => {
    setLoading(true);
    const r = await fetch("/api/admin/orders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    setLoading(false);
    if (d.success) { setSelectedOrderIds([]); refresh(); }
    else alert(d.error || "Failed to delete");
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const handleArchiveSelected = () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Move ${selectedOrderIds.length} order(s) to Archived?`)) return;
    archiveOrders({ ids: selectedOrderIds });
  };
  const handleArchiveCanceled = () => {
    if (!confirm("Archive all canceled orders?")) return;
    archiveOrders({ scope: "canceled" });
  };
  const handleArchiveFinished = () => {
    if (!confirm("Archive all finished orders (completed, canceled, expired, burned)? Numbers still in use are kept.")) return;
    archiveOrders({ scope: "finished" });
  };
  const handleArchiveAll = () => {
    if (!confirm("Archive EVERY order, including numbers still active or waiting on a code? You can restore them individually afterward from the Archived view.")) return;
    archiveOrders({ scope: "all" });
  };
  const handleArchiveDateRange = () => {
    if (!logDateFrom && !logDateTo) { alert("Pick at least a start or end date"); return; }
    if (!confirm("Archive all orders in this date range?")) return;
    archiveOrders({ scope: "all", dateFrom: logDateFrom || undefined, dateTo: logDateTo || undefined });
  };
  const handleRestoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    restoreOrders(selectedOrderIds);
  };
  const handleDeleteSelectedPermanently = () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Permanently delete ${selectedOrderIds.length} archived order(s)? This can't be undone.`)) return;
    permanentlyDelete({ ids: selectedOrderIds });
  };
  const handleDeleteAllArchivedPermanently = () => {
    if (!confirm("Permanently delete ALL archived orders? This can't be undone.")) return;
    permanentlyDelete({});
  };

  // Headline cards reflect the live log only — archiving something is meant
  // to tidy the view, so it drops out of the overview the moment it's
  // archived. Provider Health below is different on purpose: it's an
  // all-time performance record, so it keeps counting archived orders too.
  const liveOrders = orders.filter(o => !o.archived);
  const stats = {
    total: liveOrders.length,
    active: liveOrders.filter(o => o.status === "active").length,
    otp: liveOrders.filter(o => o.status === "otp_received").length,
    completed: liveOrders.filter(o => o.status === "completed" || o.status === "burned").length,
    canceled: liveOrders.filter(o => o.status === "canceled").length,
  };

  const providerName = (id?: string) => providers.find(p => p.id === (id || "provider1"))?.name || (id || "provider1");

  const providerHealth = (id: string) => {
    const list = orders.filter(o => (o.providerId || "provider1") === id);
    const pulled = list.length;
    const received = list.filter(o => !!o.otpCode).length;
    const canceled = list.filter(o => o.status === "canceled").length;
    const successRate = pulled > 0 ? Math.round((received / pulled) * 100) : null;

    const withTiming = list.filter(o => o.otpReceivedAt && o.createdAt);
    const avgSeconds = withTiming.length > 0
      ? Math.round(
          withTiming.reduce((sum, o) => sum + (new Date(o.otpReceivedAt as string).getTime() - new Date(o.createdAt).getTime()) / 1000, 0) /
          withTiming.length
        )
      : null;

    const lastUsedAt = list.reduce<string | null>((latest, o) => {
      if (!o.createdAt) return latest;
      return !latest || new Date(o.createdAt).getTime() > new Date(latest).getTime() ? o.createdAt : latest;
    }, null);

    const lastSuccessAt = withTiming.reduce<string | null>((latest, o) => {
      const t = o.otpReceivedAt as string;
      return !latest || new Date(t).getTime() > new Date(latest).getTime() ? t : latest;
    }, null);

    return { pulled, received, canceled, successRate, avgSeconds, lastUsedAt, lastSuccessAt };
  };

  // Per-offer breakdown (finer-grained than providerHealth above) — lets the
  // admin see, right next to each listing in "Manage offers", how that
  // specific listing has been performing. Orders placed before per-offer
  // tracking existed have no offerId and simply won't count toward any
  // offer here (they still count at the provider level above).
  const offerHealth = (offerId: string) => {
    const list = orders.filter(o => o.offerId === offerId);
    const pulled = list.length;
    const received = list.filter(o => !!o.otpCode).length;
    const successRate = pulled > 0 ? Math.round((received / pulled) * 100) : null;
    const lastReceivedAt = list.reduce<string | null>((latest, o) => {
      if (!o.otpReceivedAt) return latest;
      return !latest || new Date(o.otpReceivedAt).getTime() > new Date(latest).getTime() ? o.otpReceivedAt : latest;
    }, null);
    return { pulled, successRate, lastReceivedAt };
  };

  // Redis hashes don't preserve insertion order, so the raw list from the
  // API can come back shuffled — always sort, don't just pass it through.
  const displayedVouchers = vouchers
    .filter(v => (voucherStatusFilter === "all" ? true : voucherStatusFilter === "used" ? v.used : !v.used))
    .filter(v => {
      if (voucherServiceFilter === "all") return true;
      const ids = v.productIds || [];
      if (voucherServiceFilter === "any") return ids.length === 0;
      if (voucherServiceFilter === "stale") return ids.length > 0 && ids.some(id => !products.some(p => p.id === id));
      return ids.includes(voucherServiceFilter);
    })
    .sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return voucherSort === "newest" ? bt - at : at - bt;
    });

  const selectedVouchers = vouchers.filter(v => selectedVoucherIds.includes(v.id));
  const allVisibleSelected = displayedVouchers.length > 0 && displayedVouchers.every(v => selectedVoucherIds.includes(v.id));
  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedVoucherIds(ids => ids.filter(id => !displayedVouchers.some(v => v.id === id)));
    } else {
      setSelectedVoucherIds(ids => Array.from(new Set([...ids, ...displayedVouchers.map(v => v.id)])));
    }
  };

  const logOrders = orders.filter(o => (logView === "archived" ? !!o.archived : !o.archived));
  const displayedOrders = logOrders
    .filter(o => (logStatusFilter === "all" ? true : o.status === logStatusFilter))
    .filter(o => (logProviderFilter === "all" ? true : (o.providerId || "provider1") === logProviderFilter))
    .sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return logSort === "newest" ? bt - at : at - bt;
    });
  const allVisibleOrdersSelected = displayedOrders.length > 0 && displayedOrders.every(o => selectedOrderIds.includes(o.id));
  const toggleSelectAllVisibleOrders = () => {
    if (allVisibleOrdersSelected) {
      setSelectedOrderIds(ids => ids.filter(id => !displayedOrders.some(o => o.id === id)));
    } else {
      setSelectedOrderIds(ids => Array.from(new Set([...ids, ...displayedOrders.map(o => o.id)])));
    }
  };
  const switchLogView = (v: "log" | "archived") => {
    setLogView(v);
    setSelectedOrderIds([]);
  };

  if (!loggedIn) {
    return (
      <main className="min-h-screen bg-dark">
        <Header />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="w-full max-w-md bg-darker border border-red-dark/20 rounded-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-red-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="text-red-primary" size={32} />
              </div>
              <h1 className="text-2xl font-bold">Admin Login</h1>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" disabled={isLocked}
                className="w-full px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-primary disabled:opacity-50" />
              {loginError && (
                <p className="text-red-400 text-sm text-center">
                  {isLocked ? `Too many failed attempts. Try again in ${formatCountdown(remainingLockSeconds)}.` : loginError}
                </p>
              )}
              <button type="submit" disabled={loginLoading || isLocked} className="w-full py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {loginLoading ? <Loader2 className="animate-spin" size={18} /> : "Login"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark">
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-500">Manage products, providers, codes & the log</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors">
            <LogOut size={18} /><span className="hidden sm:inline">Logout</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-darker border border-red-dark/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2"><BarChart3 size={20} className="text-red-primary" /><span className="text-gray-400 text-sm">Total</span></div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-darker border border-yellow-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2"><Clock size={20} className="text-yellow-400" /><span className="text-gray-400 text-sm">Active</span></div>
            <p className="text-2xl font-bold text-yellow-400">{stats.active}</p>
          </div>
          <div className="bg-darker border border-green-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2"><CheckCircle size={20} className="text-green-400" /><span className="text-gray-400 text-sm">OTP Received</span></div>
            <p className="text-2xl font-bold text-green-400">{stats.otp}</p>
          </div>
          <div className="bg-darker border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2"><Flame size={20} className="text-red-400" /><span className="text-gray-400 text-sm">Completed</span></div>
            <p className="text-2xl font-bold text-red-400">{stats.completed}</p>
          </div>
          <div className="bg-darker border border-gray-500/20 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2"><XCircle size={20} className="text-gray-400" /><span className="text-gray-400 text-sm">Canceled</span></div>
            <p className="text-2xl font-bold text-gray-400">{stats.canceled}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-red-dark/20 pb-4 flex-wrap">
          <button onClick={() => setActiveTab("products")} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === "products" ? "bg-red-primary text-white" : "text-gray-400 hover:text-white hover:bg-red-primary/10"}`}>
            <Gamepad2 size={16} />Products
          </button>
          <button onClick={() => setActiveTab("vouchers")} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === "vouchers" ? "bg-red-primary text-white" : "text-gray-400 hover:text-white hover:bg-red-primary/10"}`}>
            <Ticket size={16} />Codes
          </button>
          <button onClick={() => setActiveTab("providers")} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === "providers" ? "bg-red-primary text-white" : "text-gray-400 hover:text-white hover:bg-red-primary/10"}`}>
            <Server size={16} />Providers
          </button>
          <button onClick={() => { setActiveTab("orders"); setSelectedOrderIds([]); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === "orders" ? "bg-red-primary text-white" : "text-gray-400 hover:text-white hover:bg-red-primary/10"}`}>
            <History size={16} />Log
          </button>
        </div>

        {activeTab === "products" && (
          <>
            <button onClick={() => { setShowAdd(!showAdd); setAddError(""); }} className="mb-6 flex items-center gap-2 px-6 py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all">
              <Plus size={20} />Add Product
            </button>

            {showAdd && (
              <div className="bg-darker border border-red-dark/20 rounded-2xl p-6 mb-8">
                <h2 className="text-xl font-bold mb-4">Add New Product</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="md:col-span-2">
                    <label className="block text-gray-400 text-sm mb-2">Product Name *</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Blizzard UK" className="w-full px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600" />
                    <p className="text-gray-500 text-xs mt-2">This is the name customers see — keep it free of any price.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-gray-400 text-sm mb-2">Country Name (shown to customer)</label>
                    <input value={formCountry} onChange={e => setFormCountry(e.target.value)} placeholder="e.g. UK, USA, Portugal" className="w-full px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600" />
                  </div>
                </div>

                <label className="block text-gray-400 text-sm mb-2">Offers — one per listing this service can be pulled from (you can add several from the same provider)</label>
                <OfferBuilder
                  providers={providers}
                  offers={newProductOffers}
                  onAdd={o => setNewProductOffers(os => [...os, { ...o, id: makeTempOfferId() }])}
                  onRemove={i => setNewProductOffers(os => os.filter((_, idx) => idx !== i))}
                  onMove={moveNewOffer}
                />
                <p className="text-gray-500 text-xs mt-2 mb-4">You can also save with no offers yet and add them later — the product just won't show up for customers until it has at least one.</p>

                {addError && <p className="text-red-400 text-sm mb-4">{addError}</p>}
                <button onClick={handleAdd} disabled={loading} className="w-full py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <><Plus size={18} />Save Product</>}
                </button>
              </div>
            )}

            <div className="space-y-4">
              {products.map(p => (
                <div key={p.id} className="bg-darker border border-red-dark/20 rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-lg">{p.name}</h3>
                      <p className="text-gray-500 text-sm flex items-center gap-1"><MapPin size={12} />{p.country} · {p.offers.length} offer{p.offers.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setExpandedProductId(expandedProductId === p.id ? null : p.id)} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors">
                        {expandedProductId === p.id ? "Hide offers" : "Manage offers"}
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {p.offers.length === 0 && expandedProductId !== p.id && (
                    <p className="text-yellow-500 text-xs mt-2">No offers yet — customers won't see this product until you add one.</p>
                  )}
                  {expandedProductId === p.id && (
                    <div className="mt-4 pt-4 border-t border-red-dark/10">
                      <OfferBuilder
                        providers={providers}
                        offers={p.offers}
                        onAdd={o => handleAddOfferToProduct(p, o)}
                        onRemove={i => handleRemoveOfferFromProduct(p, i)}
                        onMove={(i, dir) => handleMoveOfferInProduct(p, i, dir)}
                        offerStats={Object.fromEntries(p.offers.map(o => [o.id, offerHealth(o.id)]))}
                      />
                    </div>
                  )}
                </div>
              ))}
              {products.length === 0 && <div className="text-center py-12 text-gray-500 bg-darker border border-red-dark/20 rounded-2xl">No products yet. Add one above.</div>}
            </div>
          </>
        )}

        {activeTab === "vouchers" && (
          <>
            <button onClick={() => { setShowVoucher(!showVoucher); setVoucherFormError(""); }} className="mb-6 flex items-center gap-2 px-6 py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all">
              <Ticket size={20} />Generate Code
            </button>

            {showVoucher && (
              <div className="bg-darker border border-red-dark/20 rounded-2xl p-6 mb-8">
                <h2 className="text-xl font-bold mb-4">Create Code{voucherBulkMode ? "s" : ""}</h2>

                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => { setVoucherBulkMode(false); setVoucherFormError(""); }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!voucherBulkMode ? "bg-red-primary text-white" : "bg-dark text-gray-400 border border-red-dark/30"}`}>Single code</button>
                  <button type="button" onClick={() => { setVoucherBulkMode(true); setVoucherFormError(""); }} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${voucherBulkMode ? "bg-red-primary text-white" : "bg-dark text-gray-400 border border-red-dark/30"}`}>Bulk (many at once)</button>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-4">
                  {voucherBulkMode ? (
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Codes (one per line)</label>
                      <textarea
                        value={voucherCodes}
                        onChange={e => setVoucherCodes(e.target.value.toUpperCase())}
                        placeholder={"ABC123\nDEF456\nGHI789"}
                        rows={6}
                        className="w-full px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600 font-mono text-sm"
                      />
                      <p className="text-gray-500 text-xs mt-2">
                        Paste as many codes as you want — one per line (commas also work). All of them get the same service settings below. Any that already exist are skipped automatically and you'll be told which.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Code</label>
                      <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} placeholder="e.g. BLZ2024" className="w-full px-4 py-3 bg-dark border border-red-dark/30 rounded-xl text-white placeholder-gray-600" />
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input type="checkbox" checked={voucherAnyService} onChange={e => setVoucherAnyService(e.target.checked)} className="accent-red-500" />
                      <span className="font-bold text-sm">Available for any service</span>
                    </label>
                    {voucherAnyService ? (
                      <p className="text-gray-500 text-xs bg-dark/50 border border-red-dark/20 rounded-xl p-3">
                        This code{voucherBulkMode ? "s" : ""} will work for ANY service you currently have listed — and anything you add later. The customer picks which one when they redeem it.
                      </p>
                    ) : (
                      <>
                        <label className="block text-gray-400 text-sm mb-2">Services this code can be used for (pick one or more)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-dark border border-red-dark/30 rounded-xl">
                          {products.map(p => (
                            <label key={p.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={voucherProductIds.includes(p.id)}
                                onChange={() => toggleVoucherProduct(p.id)}
                                className="accent-red-500"
                              />
                              {p.name} ({p.country})
                            </label>
                          ))}
                          {products.length === 0 && <p className="text-gray-500 text-sm">No products yet — add one first.</p>}
                        </div>
                        <p className="text-gray-500 text-xs mt-2">If you pick more than one, the customer chooses which one to redeem the code against.</p>
                      </>
                    )}
                  </div>
                </div>
                {voucherFormError && <p className="text-red-400 text-sm mb-4">{voucherFormError}</p>}
                <button onClick={handleAddVoucher} disabled={loading} className="w-full py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <><Ticket size={18} />{voucherBulkMode ? "Create Codes" : "Create Code"}</>}
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mb-4">
              <select value={voucherSort} onChange={e => setVoucherSort(e.target.value as "newest" | "oldest")} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <select value={voucherStatusFilter} onChange={e => setVoucherStatusFilter(e.target.value as "all" | "available" | "used")} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="used">Used</option>
              </select>
              <select value={voucherServiceFilter} onChange={e => setVoucherServiceFilter(e.target.value)} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="all">All services</option>
                <option value="any">Any-service codes</option>
                <option value="stale">Codes with a removed service</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.country})</option>)}
              </select>
            </div>

            {selectedVouchers.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-red-primary/10 border border-red-primary/30 rounded-xl">
                <span className="text-sm font-bold">{selectedVouchers.length} selected</span>
                <button
                  onClick={() => { setShowBulkEditServices(true); setBulkEditError(""); setBulkEditProductIds([]); setBulkEditAnyService(false); }}
                  className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors"
                >
                  Edit services
                </button>
                <button onClick={handleBulkDeleteVouchers} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-colors">
                  Delete selected
                </button>
                <button onClick={() => setSelectedVoucherIds([])} className="px-4 py-2 text-gray-400 text-sm hover:text-white transition-colors">
                  Clear selection
                </button>
              </div>
            )}

            {showBulkEditServices && (
              <div className="bg-darker border border-red-dark/20 rounded-2xl p-6 mb-6">
                <h2 className="text-xl font-bold mb-1">Edit services for {selectedVouchers.length} code{selectedVouchers.length === 1 ? "" : "s"}</h2>
                <p className="text-gray-500 text-xs mb-4">This replaces which services these codes are valid for — it doesn't add to what they already had.</p>

                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={bulkEditAnyService} onChange={e => setBulkEditAnyService(e.target.checked)} className="accent-red-500" />
                  <span className="font-bold text-sm">Available for any service</span>
                </label>

                {bulkEditAnyService ? (
                  <p className="text-gray-500 text-xs bg-dark/50 border border-red-dark/20 rounded-xl p-3 mb-4">
                    These codes will work for ANY service you currently have listed — and anything you add later.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-dark border border-red-dark/30 rounded-xl mb-4">
                    {products.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkEditProductIds.includes(p.id)}
                          onChange={() => setBulkEditProductIds(ids => ids.includes(p.id) ? ids.filter(x => x !== p.id) : [...ids, p.id])}
                          className="accent-red-500"
                        />
                        {p.name} ({p.country})
                      </label>
                    ))}
                    {products.length === 0 && <p className="text-gray-500 text-sm">No products yet — add one first.</p>}
                  </div>
                )}

                {bulkEditError && <p className="text-red-400 text-sm mb-4">{bulkEditError}</p>}

                <div className="flex gap-3">
                  <button onClick={handleBulkEditServices} disabled={loading} className="flex-1 py-3 bg-red-primary hover:bg-red-light text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={18} /> : `Apply to ${selectedVouchers.length} code${selectedVouchers.length === 1 ? "" : "s"}`}
                  </button>
                  <button onClick={() => setShowBulkEditServices(false)} className="px-6 py-3 bg-dark border border-red-dark/30 rounded-xl font-bold text-gray-300 hover:bg-red-dark/10 transition-colors">Cancel</button>
                </div>
              </div>
            )}

            <div className="bg-darker border border-red-dark/20 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-red-dark/20">
                  <th className="px-4 py-4 w-10"><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="accent-red-500" /></th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Code</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Valid for</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Created</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {displayedVouchers.map(v => (
                    <tr key={v.id} className={`border-b border-red-dark/10 hover:bg-red-primary/5 transition-colors ${selectedVoucherIds.includes(v.id) ? "bg-red-primary/5" : ""}`}>
                      <td className="px-4 py-4"><input type="checkbox" checked={selectedVoucherIds.includes(v.id)} onChange={() => toggleVoucherSelection(v.id)} className="accent-red-500" /></td>
                      <td className="px-6 py-4 font-mono font-bold">{v.code}</td>
                      <td className="px-6 py-4 text-sm">
                        {(v.productIds || []).length === 0 ? (
                          <span className="text-blue-400 font-medium">Any service</span>
                        ) : (
                          (v.productIds || []).map((id, i, arr) => {
                            const p = products.find(pp => pp.id === id);
                            return (
                              <span key={id}>
                                {p ? p.name : <span className="text-yellow-500 italic">removed service</span>}
                                {i < arr.length - 1 ? ", " : ""}
                              </span>
                            );
                          })
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${v.used ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                          {v.used ? "Used" : "Available"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-6 py-4">
                        <button onClick={() => handleDeleteVoucher(v.id)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vouchers.length === 0 && <div className="text-center py-12 text-gray-500">No codes yet</div>}
              {vouchers.length > 0 && displayedVouchers.length === 0 && <div className="text-center py-12 text-gray-500">No codes match these filters</div>}
            </div>
          </>
        )}

        {activeTab === "providers" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {providers.map(p => {
              const h = providerHealth(p.id);
              const available = p.configured && !p.balanceError;
              return (
                <div key={p.id} className="bg-darker border border-red-dark/20 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                      !p.configured ? "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                      : available ? "bg-green-500/10 text-green-400 border border-green-500/30"
                      : "bg-red-500/10 text-red-400 border border-red-500/30"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${!p.configured ? "bg-gray-400" : available ? "bg-green-400" : "bg-red-400"}`} />
                      {!p.configured ? "Not set up" : available ? "Available" : "Unreachable"}
                    </span>
                  </div>

                  <div className="mb-4 p-4 bg-dark/30 rounded-xl flex items-center justify-between gap-4">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Account balance</p>
                      <p className="text-xl font-bold">{p.balance !== null && p.balance !== undefined ? `$${p.balance}` : "—"}</p>
                    </div>
                    {p.balanceError && <p className="text-red-400 text-xs text-right max-w-[55%]">{p.balanceError}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-4 bg-dark/30 rounded-xl">
                      <p className="text-gray-400 text-xs mb-1">Numbers pulled</p>
                      <p className="text-2xl font-bold">{h.pulled}</p>
                    </div>
                    <div className="p-4 bg-dark/30 rounded-xl">
                      <p className="text-gray-400 text-xs mb-1">Received a code</p>
                      <p className="text-2xl font-bold text-green-400">{h.received}</p>
                    </div>
                    <div className="p-4 bg-dark/30 rounded-xl">
                      <p className="text-gray-400 text-xs mb-1">Canceled</p>
                      <p className="text-2xl font-bold text-gray-400">{h.canceled}</p>
                    </div>
                    <div className="p-4 bg-dark/30 rounded-xl">
                      <p className="text-gray-400 text-xs mb-1">Success rate</p>
                      <p className="text-2xl font-bold">{h.successRate !== null ? `${h.successRate}%` : "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 bg-dark/30 rounded-xl">
                      <p className="text-gray-500 text-xs mb-1">Avg. code arrival</p>
                      <p className="font-bold">{formatDuration(h.avgSeconds)}</p>
                    </div>
                    <div className="p-3 bg-dark/30 rounded-xl">
                      <p className="text-gray-500 text-xs mb-1">Last used</p>
                      <p className="font-bold">{timeAgo(h.lastUsedAt)}</p>
                    </div>
                    <div className="p-3 bg-dark/30 rounded-xl">
                      <p className="text-gray-500 text-xs mb-1">Last success</p>
                      <p className="font-bold">{timeAgo(h.lastSuccessAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {providers.length === 0 && <div className="md:col-span-2 text-center py-12 text-gray-500 bg-darker border border-red-dark/20 rounded-2xl">Loading providers...</div>}
          </div>
        )}

        {activeTab === "orders" && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex gap-1 p-1 bg-dark border border-red-dark/30 rounded-xl">
                <button onClick={() => switchLogView("log")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${logView === "log" ? "bg-red-primary text-white" : "text-gray-400"}`}>Log</button>
                <button onClick={() => switchLogView("archived")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${logView === "archived" ? "bg-red-primary text-white" : "text-gray-400"}`}>Archived</button>
              </div>
              <select value={logSort} onChange={e => setLogSort(e.target.value as "newest" | "oldest")} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <select value={logStatusFilter} onChange={e => setLogStatusFilter(e.target.value)} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="all">All statuses</option>
                <option value="active">Waiting</option>
                <option value="otp_received">Code received</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="expired">Expired</option>
                <option value="burned">Burned</option>
              </select>
              <select value={logProviderFilter} onChange={e => setLogProviderFilter(e.target.value)} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-xl text-white text-sm">
                <option value="all">All providers</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {logView === "log" ? (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-dark/30 border border-red-dark/20 rounded-xl">
                <span className="text-sm text-gray-400">{selectedOrderIds.length > 0 ? `${selectedOrderIds.length} selected` : "Clear the log — nothing is deleted right away, it just moves to Archived:"}</span>
                <button onClick={handleArchiveSelected} disabled={selectedOrderIds.length === 0} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors disabled:opacity-40">Archive selected</button>
                <button onClick={handleArchiveCanceled} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors">Archive canceled only</button>
                <button onClick={handleArchiveFinished} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors">Archive finished</button>
                <button onClick={() => setShowDateRangeArchive(v => !v)} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors">Archive by date...</button>
                <button onClick={handleArchiveAll} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-colors sm:ml-auto">Archive everything</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-dark/30 border border-red-dark/20 rounded-xl">
                <span className="text-sm text-gray-400">{selectedOrderIds.length > 0 ? `${selectedOrderIds.length} selected` : "Archived entries — restore them, or delete them for good:"}</span>
                <button onClick={handleRestoreSelected} disabled={selectedOrderIds.length === 0} className="px-4 py-2 bg-dark border border-red-dark/30 rounded-lg text-sm font-bold hover:bg-red-dark/10 transition-colors disabled:opacity-40">Restore selected</button>
                <button onClick={handleDeleteSelectedPermanently} disabled={selectedOrderIds.length === 0} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-colors disabled:opacity-40">Delete selected permanently</button>
                <button onClick={handleDeleteAllArchivedPermanently} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-bold hover:bg-red-500/20 transition-colors sm:ml-auto">Delete ALL archived permanently</button>
              </div>
            )}

            {showDateRangeArchive && logView === "log" && (
              <div className="flex flex-wrap items-end gap-3 mb-4 p-4 bg-dark/30 border border-red-dark/20 rounded-xl">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">From</label>
                  <input type="date" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} className="px-3 py-2 bg-dark border border-red-dark/30 rounded-lg text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">To</label>
                  <input type="date" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} className="px-3 py-2 bg-dark border border-red-dark/30 rounded-lg text-white text-sm" />
                </div>
                <button onClick={handleArchiveDateRange} className="px-4 py-2 bg-red-primary hover:bg-red-light text-white rounded-lg text-sm font-bold transition-all">Archive this range</button>
              </div>
            )}

            <div className="bg-darker border border-red-dark/20 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-red-dark/20">
                  <th className="px-4 py-4 w-10"><input type="checkbox" checked={allVisibleOrdersSelected} onChange={toggleSelectAllVisibleOrders} className="accent-red-500" /></th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Code</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Phone</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Provider</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">OTP</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Messages</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Date</th>
                  <th className="text-left px-6 py-4 text-gray-400 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {displayedOrders.map(o => (
                    <tr key={o.id} className={`border-b border-red-dark/10 hover:bg-red-primary/5 transition-colors ${selectedOrderIds.includes(o.id) ? "bg-red-primary/5" : ""}`}>
                      <td className="px-4 py-4"><input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => toggleOrderSelection(o.id)} className="accent-red-500" /></td>
                      <td className="px-6 py-4 font-mono text-sm">{o.voucherCode || "-"}</td>
                      <td className="px-6 py-4 font-mono">{o.phoneNumber || "-"}</td>
                      <td className="px-6 py-4 text-sm">{providerName(o.providerId)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          o.status === "active" ? "bg-yellow-500/10 text-yellow-400" :
                          o.status === "otp_received" ? "bg-green-500/10 text-green-400" :
                          o.status === "completed" || o.status === "burned" ? "bg-red-500/10 text-red-400" :
                          "bg-gray-500/10 text-gray-400"
                        }`}>{o.status}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">{o.otpCode || "-"}</td>
                      <td className="px-6 py-4">{o.messageCount}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-6 py-4">
                        {logView === "log" ? (
                          <button onClick={() => archiveOrders({ ids: [o.id] })} className="p-2 rounded-lg bg-dark border border-red-dark/30 text-gray-400 hover:text-white transition-colors" title="Archive"><Archive size={16} /></button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => restoreOrders([o.id])} className="p-2 rounded-lg bg-dark border border-red-dark/30 text-gray-400 hover:text-white transition-colors" title="Restore"><RotateCcw size={16} /></button>
                            <button onClick={() => { if (confirm("Permanently delete this order?")) permanentlyDelete({ ids: [o.id] }); }} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Delete permanently"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logOrders.length === 0 && <div className="text-center py-12 text-gray-500">{logView === "archived" ? "No archived orders" : "No orders yet"}</div>}
              {logOrders.length > 0 && displayedOrders.length === 0 && <div className="text-center py-12 text-gray-500">No orders match these filters</div>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
