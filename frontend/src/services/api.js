// ─── Global Response Cache ─────────────────────────────────────────────────
// Every GET request is cached by URL key. POST requests are cached by URL + body hash.
// Cache entries expire after a configurable TTL (default 60s, environment 300s).
const _cache = new Map();
const DEFAULT_TTL_MS = 60_000;
const ENV_TTL_MS = 300_000;

function _cacheKey(url, body) {
  return body ? `${url}::${body}` : url;
}

function _cachedGet(key) {
  if (!_cache.has(key)) return undefined;
  const entry = _cache.get(key);
  if (Date.now() - entry.ts > entry.ttl) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function _cacheSet(key, data, ttl = DEFAULT_TTL_MS) {
  _cache.set(key, { data, ts: Date.now(), ttl });
  // Prevent unbounded growth
  if (_cache.size > 200) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
}

/** Clear all cached API responses (useful after mutations). */
export function clearApiCache() {
  _cache.clear();
}

// ─── Core request with abort + caching ─────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function request(path, options = {}, { cacheTtl, skipCache } = {}) {
  const url = `${API_BASE}${path}`;
  const method = (options.method || "GET").toUpperCase();
  const bodyStr = options.body || "";
  const key = _cacheKey(url, method === "GET" ? "" : bodyStr);

  // Return cached if fresh (skip for mutations like trackAction)
  if (!skipCache) {
    const cached = _cachedGet(key);
    if (cached !== undefined) return cached;
  }

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail);
  }

  const data = await response.json();

  // Cache the successful response
  const ttl = cacheTtl ?? (path.includes("/environment") ? ENV_TTL_MS : DEFAULT_TTL_MS);
  _cacheSet(key, data, ttl);

  return data;
}

export const api = {
  createUser: (payload) =>
    request("/api/user", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { skipCache: true }),

  user: (id) => request(`/api/user/${id}`),

  savePreferences: (payload) =>
    request("/api/user/preferences", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { skipCache: true }),

  preferences: (userId) => request(`/api/user/preferences/${userId}`),

  environment: ({ lat, lon, city } = {}) => {
    const params = new URLSearchParams();
    if (lat != null && lon != null) {
      // Round coordinates to 3 decimal places (~111m precision)
      // to maximise cache hits for nearby locations
      params.set("lat", String(Math.round(lat * 1000) / 1000));
      params.set("lon", String(Math.round(lon * 1000) / 1000));
    }
    if (city) params.set("city", city);
    return request(`/api/environment?${params.toString()}`, {}, { cacheTtl: ENV_TTL_MS });
  },

  search: ({ query, lat, lon }) => {
    let url = `/api/search?query=${encodeURIComponent(query)}`;
    if (lat != null) url += `&lat=${lat}`;
    if (lon != null) url += `&lon=${lon}`;
    return request(url);
  },

  geocode: (query) => request(`/api/geocode?query=${encodeURIComponent(query)}`),

  compareRoutes: (payload) =>
    request("/api/routes/compare", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  tripCompute: (payload) =>
    request("/api/trip/compute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  aiRecommend: (payload) =>
    request("/api/ai/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  recommendation: (userId, params = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) query.set(key, String(value));
    }
    return request(`/api/recommendation/${userId}?${query.toString()}`);
  },

  trackAction: (payload) =>
    request("/api/action", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { skipCache: true }),

  history: (userId) => request(`/api/history/${userId}`),
  carbonScore: (userId) => request(`/api/carbon-score/${userId}`),

  simulate: (payload) =>
    request("/api/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  redeem: (payload) =>
    request("/api/redeem", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { skipCache: true }),

  leaderboard: () => request("/api/leaderboard"),
  communityStats: () => request("/api/community/stats"),
};
