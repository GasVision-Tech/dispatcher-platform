const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8010";

function getToken() {
  return localStorage.getItem("gv_token");
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem("gv_token");
    throw new Error("auth");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "request failed");
  }

  return response.json();
}

export async function login(email, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function getMe() {
  return request("/api/auth/me");
}

export async function getStations() {
  return request("/api/stations");
}

export async function getDashboardSummary() {
  return request("/api/dashboard/summary");
}

export async function getEvents(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return request(`/api/events${query ? `?${query}` : ""}`);
}

export async function getEvent(id) {
  return request(`/api/events/${id}`);
}

export async function patchEventStatus(id, status) {
  return request(`/api/events/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}
