const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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
  return response.json();
}

export const api = {
  createUser: (payload) =>
    request("/api/user", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  user: (id) => request(`/api/user/${id}`),
  savePreferences: (payload) =>
    request("/api/user/preferences", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  preferences: (userId) => request(`/api/user/preferences/${userId}`),
  environment: ({ lat, lon, city } = {}) => {
    const params = new URLSearchParams();
    if (lat != null && lon != null) {
      params.set("lat", String(lat));
      params.set("lon", String(lon));
    }
    if (city) params.set("city", city);
    return request(`/api/environment?${params.toString()}`);
  },
  search: (query) => request(`/api/search?query=${encodeURIComponent(query)}`),
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
    }),
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
    }),
  leaderboard: () => request("/api/leaderboard"),
};
