export type GameBoostCreatePayload = {
  game_id?: number;
  game?: string;
  title: string;
  description: string;
  price: number;
  credentials: string[];
  image_urls: string[];
  account_data?: Record<string, unknown>;
  external_id?: string;
};

export type GameBoostOffer = {
  id: string;
  title?: string;
  status?: string;
  price?: number;
};

export class GameBoostClient {
  constructor(
    private token: string,
    private baseUrl = process.env.GAMEBOOST_API_BASE ?? "https://api.gameboost.com"
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const err = body as { message?: string; errors?: Record<string, string[]> };
      const detail =
        err.message ??
        (err.errors ? JSON.stringify(err.errors) : undefined) ??
        `GameBoost HTTP ${res.status}`;
      throw new Error(detail);
    }

    return body as T;
  }

  async getTemplate(gameSlug: string): Promise<Record<string, unknown>> {
    return this.request(`/v2/account-offers/templates/${encodeURIComponent(gameSlug)}`);
  }

  async createOffer(payload: GameBoostCreatePayload): Promise<{ data: GameBoostOffer }> {
    return this.request("/v2/account-offers/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listOffer(offerId: string): Promise<{ data: GameBoostOffer }> {
    return this.request(`/v2/account-offers/${offerId}/list`, { method: "POST" });
  }
}
