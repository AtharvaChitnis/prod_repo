const API = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error ?? {};
    throw new ApiError(response.status, error.code ?? "request_failed", error.message ?? "Request failed");
  }
  return data as T;
}

export function oauthStartUrl(): string {
  const returnTo = `${window.location.origin}/app/projects`;
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  return `${base}/api/v1/auth/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function downloadExport(id: string, format: "json" | "csv"): Promise<void> {
  const response = await fetch(`${API}/results/${id}/export?format=${format}`, { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error?.code ?? "export_failed", data.error?.message ?? "Export failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `research-${id}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
