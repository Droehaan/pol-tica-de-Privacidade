export type LztAccountItem = {
  item_id: number;
  title?: string;
  description?: string;
  price?: number;
  category_id?: number;
  category_name?: string;
  loginData?: {
    login?: string;
    password?: string;
    raw?: string;
    encodedRaw?: string;
  };
  imagePreviewLinks?: string[];
  imageLinks?: string[];
  params?: Record<string, unknown>;
  item_state?: string;
};

export class LztMarketClient {
  constructor(
    private token: string,
    private baseUrl = process.env.LZT_API_BASE ?? "https://prod-api.lzt.market"
  ) {}

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
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
      const err = body as { errors?: string[]; error?: string; message?: string };
      const msg =
        err.errors?.join(", ") ?? err.error ?? err.message ?? `LZT HTTP ${res.status}`;
      throw new Error(msg);
    }

    return body as T;
  }

  async getPurchasedOrders(userId: string, page = 1): Promise<{
    items?: LztAccountItem[];
    pagination?: { page: number; total_pages: number };
  }> {
    return this.request(`/user/${userId}/orders?page=${page}`);
  }

  async getItem(itemId: number): Promise<{ item: LztAccountItem }> {
    return this.request(`/${itemId}`);
  }

  async fastBuy(itemId: number, price: number, balanceId?: number): Promise<{
    item?: LztAccountItem;
    status?: string;
  }> {
    const qs = balanceId != null ? `?balance_id=${balanceId}` : "";
    return this.request(`/${itemId}/fast-buy${qs}`, {
      method: "POST",
      body: JSON.stringify({ price }),
    });
  }

  async getAccountImages(itemId: number): Promise<string[]> {
    try {
      const data = await this.request<{ images?: { url?: string }[] }>(
        `/${itemId}/image`
      );
      if (data.images?.length) {
        return data.images.map((i) => i.url).filter(Boolean) as string[];
      }
    } catch {
      /* fallback below */
    }
    const { item } = await this.getItem(itemId);
    return item.imagePreviewLinks ?? item.imageLinks ?? [];
  }
}
