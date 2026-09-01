import type { ProviderId } from "./types";

interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  apiKey: string;
}

// Two fixed provider slots. Provider 1 falls back to the original
// SMS_POWER_API_KEY / api.smscode.gg env vars so existing deployments keep
// working unchanged after this update — it just becomes "Provider 1".
// Provider 2 is opt-in: leave its API key unset and it simply won't appear
// as a choosable option anywhere (see listConfiguredProviders below).
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "provider1",
    name: process.env.SMS_PROVIDER_1_NAME || "Provider 1",
    baseUrl: process.env.SMS_PROVIDER_1_BASE_URL || "https://api.smscode.gg/v2",
    apiKey: process.env.SMS_PROVIDER_1_API_KEY || process.env.SMS_POWER_API_KEY || "",
  },
  {
    id: "provider2",
    name: process.env.SMS_PROVIDER_2_NAME || "Provider 2",
    baseUrl: process.env.SMS_PROVIDER_2_BASE_URL || "https://api.smscode.gg/v2",
    apiKey: process.env.SMS_PROVIDER_2_API_KEY || "",
  },
];

export function getProviderConfig(id: ProviderId): ProviderConfig {
  const p = PROVIDERS.find(p => p.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

// Providers with no API key configured yet are hidden from the admin's
// catalog browser and never offered to customers — they exist as a slot but
// aren't "live" until a key is set.
export function listConfiguredProviders(): ProviderConfig[] {
  return PROVIDERS.filter(p => !!p.apiKey);
}

export function isProviderConfigured(id: ProviderId): boolean {
  return !!getProviderConfig(id).apiKey;
}

function makeClient(providerId: ProviderId) {
  const cfg = getProviderConfig(providerId);

  async function api(path: string, opts?: RequestInit) {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...opts?.headers,
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error?.message || `HTTP ${res.status}`);
    }
    return json;
  }

  return {
    getCountries: () => api("/catalog/countries"),
    getServices: (countryId: number) => api(`/catalog/services?country_id=${countryId}`),
    getProducts: (countryId: number, platformId: number) =>
      api(`/catalog/products?country_id=${countryId}&platform_id=${platformId}&limit=100`),
    getBalance: () => api("/balance"),
    createOrder: (body: object) =>
      api("/orders/create", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Idempotency-Key": `qsp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        },
      }),
    getOrder: (id: number) => api(`/orders/${id}`),
    getActiveOrders: () => api("/orders/active"),
    cancelOrder: (id: number) => api("/orders/cancel", { method: "POST", body: JSON.stringify({ id }) }),
    finishOrder: (id: number) => api("/orders/finish", { method: "POST", body: JSON.stringify({ id }) }),
    resendOrder: (id: number) => api("/orders/resend", { method: "POST", body: JSON.stringify({ id }) }),
    reactivateOrder: (id: number, maxPrice?: string) =>
      api("/orders/reactivate", {
        method: "POST",
        body: JSON.stringify({ id, ...(maxPrice ? { max_price: maxPrice } : {}) }),
        headers: {
          "Idempotency-Key": `qsp-re-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        },
      }),
  };
}

export type ProviderClient = ReturnType<typeof makeClient>;

const clientCache: Partial<Record<ProviderId, ProviderClient>> = {};

// Orders/products that predate multi-provider support don't carry a
// providerId in Redis — always resolve a missing/unknown value to
// "provider1" so old data keeps working against the provider that used to be
// the only one.
export function resolveProviderId(id: string | null | undefined): ProviderId {
  return id === "provider2" ? "provider2" : "provider1";
}

export function getProviderClient(providerId: ProviderId): ProviderClient {
  if (!clientCache[providerId]) {
    clientCache[providerId] = makeClient(providerId);
  }
  return clientCache[providerId]!;
}
