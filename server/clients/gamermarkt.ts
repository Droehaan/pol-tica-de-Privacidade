/**
 * GamerMarkt não expõe API pública documentada para vendedores.
 * Este adaptador prepara o payload e, quando credenciais/base URL forem
 * fornecidas (parceria ou integração interna), tenta publicar via HTTP.
 * Caso contrário, deixa o anúncio em fila manual com dados prontos.
 */
export type GamerMarktListingPayload = {
  title: string;
  description: string;
  price: number;
  game: string;
  images: string[];
  credentials: { login: string; password: string };
  external_ref: string;
};

export class GamerMarktClient {
  constructor(
    private apiKey: string,
    private baseUrl = process.env.GAMERMARKT_API_BASE ?? ""
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.baseUrl);
  }

  async createListing(
    payload: GamerMarktListingPayload
  ): Promise<{ listingId: string; mode: "api" | "manual" }> {
    if (!this.isConfigured()) {
      return {
        listingId: `manual-${payload.external_ref}`,
        mode: "manual",
      };
    }

    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/listings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        price: payload.price,
        game_slug: payload.game,
        image_urls: payload.images,
        account_login: payload.credentials.login,
        account_password: payload.credentials.password,
        seller_reference: payload.external_ref,
      }),
    });

    const text = await res.text();
    let body: { id?: string; listing_id?: string; message?: string } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    if (!res.ok) {
      throw new Error(body.message ?? `GamerMarkt HTTP ${res.status}`);
    }

    return {
      listingId: String(body.id ?? body.listing_id ?? payload.external_ref),
      mode: "api",
    };
  }
}
