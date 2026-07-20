const API = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Erro HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  login: (password: string) =>
    request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  dashboard: () =>
    request<{
      inventoryByStatus: Record<string, number>;
      pendingJobs: number;
      lastLztSync: string | null;
    }>("/dashboard"),
  settings: () =>
    request<{ masked: Record<string, string>; gamermarktApiConfigured: boolean }>("/settings"),
  saveSettings: (body: Record<string, string>) =>
    request("/settings", { method: "PUT", body: JSON.stringify(body) }),
  inventory: () => request<{ items: InventoryItem[] }>("/inventory"),
  syncLzt: () => request<{ imported: number; skipped: number }>("/sync/lzt-purchases", { method: "POST" }),
  fastBuy: (item_id: number, price: number) =>
    request("/lzt/fast-buy", { method: "POST", body: JSON.stringify({ item_id, price }) }),
  importLzt: (itemId: number) =>
    request(`/lzt/import/${itemId}`, { method: "POST" }),
  processJobs: () => request<{ processed: number }>("/jobs/process", { method: "POST", body: "{}" }),
  templates: () => request<{ templates: Template[] }>("/templates"),
  saveTemplate: (body: {
    id?: string;
    name: string;
    game_slug?: string | null;
    title_template: string;
    description_template: string;
    markup_percent: number;
    is_default?: boolean | number;
  }) =>
    body.id
      ? request(`/templates/${body.id}`, { method: "PUT", body: JSON.stringify(body) })
      : request("/templates", { method: "POST", body: JSON.stringify(body) }),
  jobs: () => request<{ jobs: JobRow[] }>("/jobs"),
};

export type InventoryItem = {
  id: string;
  lzt_item_id: number;
  game_slug: string | null;
  status: string;
  generated_title: string | null;
  sale_price: number | null;
  gameboost_offer_id: string | null;
  gamermarkt_listing_id: string | null;
  error_message: string | null;
  created_at: string;
};

export type Template = {
  id: string;
  name: string;
  game_slug: string | null;
  title_template: string;
  description_template: string;
  markup_percent: number;
  is_default: number;
  created_at?: string;
};

export type JobRow = {
  id: string;
  job_type: string;
  status: string;
  last_error: string | null;
  lzt_item_id: number;
  generated_title: string | null;
  created_at: string;
};

export const statusLabel: Record<string, string> = {
  purchased: "Comprado (aguardando publicação)",
  listed_partial: "Publicado parcialmente",
  listed_all: "Publicado nos dois marketplaces",
  listed_gameboost_only: "Só GameBoost",
  pending_gamermarkt_manual: "GamerMarkt — ação manual",
  failed: "Falhou",
};
