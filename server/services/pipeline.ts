import { v4 as uuid } from "uuid";
import { db, getSetting } from "../db.js";
import { LztMarketClient, type LztAccountItem } from "../clients/lzt.js";
import { GameBoostClient } from "../clients/gameboost.js";
import { GamerMarktClient } from "../clients/gamermarkt.js";
import { buildListingContent, extractCredentials } from "./templating.js";

export type InventoryRow = {
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

function clients() {
  const lztToken = getSetting("lzt_token");
  const lztUserId = getSetting("lzt_user_id");
  const gbToken = getSetting("gameboost_token");
  const gmKey = getSetting("gamermarkt_api_key") ?? getSetting("gamermarkt_token") ?? "";

  if (!lztToken) throw new Error("Token LZT Market não configurado");
  if (!lztUserId) throw new Error("ID de usuário LZT não configurado");

  return {
    lztUserId,
    lzt: new LztMarketClient(lztToken),
    gameboost: gbToken ? new GameBoostClient(gbToken) : null,
    gamermarkt: new GamerMarktClient(gmKey),
  };
}

export function listInventory(): InventoryRow[] {
  return db
    .prepare(
      `SELECT id, lzt_item_id, game_slug, status, generated_title, sale_price,
              gameboost_offer_id, gamermarkt_listing_id, error_message, created_at
       FROM inventory_items ORDER BY created_at DESC LIMIT 200`
    )
    .all() as InventoryRow[];
}

export function getInventoryDetail(id: string) {
  return db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(id);
}

function upsertFromLztItem(item: LztAccountItem, loginData?: LztAccountItem["loginData"]) {
  const merged = { ...item, loginData: loginData ?? item.loginData };
  const cost = Number(merged.price ?? 0);
  const content = buildListingContent(merged, cost);
  const existing = db
    .prepare(`SELECT id FROM inventory_items WHERE lzt_item_id = ?`)
    .get(merged.item_id) as { id: string } | undefined;

  const imageUrls = merged.imagePreviewLinks ?? merged.imageLinks ?? [];
  const creds = extractCredentials(merged);

  if (existing) {
    db.prepare(
      `UPDATE inventory_items SET
        game_slug = ?, lzt_title = ?, lzt_price = ?, login_data = ?, raw_account_json = ?,
        image_urls = ?, generated_title = ?, generated_description = ?, sale_price = ?,
        status = CASE WHEN status = 'failed' THEN 'purchased' ELSE status END,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      content.gameSlug,
      merged.title ?? "",
      cost,
      JSON.stringify(creds),
      JSON.stringify(merged),
      JSON.stringify(imageUrls),
      content.title,
      content.description,
      content.salePrice,
      existing.id
    );
    return existing.id;
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO inventory_items (
      id, lzt_item_id, game_slug, lzt_title, lzt_price, login_data, raw_account_json,
      image_urls, generated_title, generated_description, sale_price, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'purchased')`
  ).run(
    id,
    merged.item_id,
    content.gameSlug,
    merged.title ?? "",
    cost,
    JSON.stringify(creds),
    JSON.stringify(merged),
    JSON.stringify(imageUrls),
    content.title,
    content.description,
    content.salePrice
  );
  return id;
}

export async function syncPurchasesFromLzt(): Promise<{ imported: number; skipped: number }> {
  const { lzt, lztUserId } = clients();
  let page = 1;
  let imported = 0;
  let skipped = 0;
  const known = new Set(
    (
      db.prepare(`SELECT lzt_item_id FROM inventory_items`).all() as { lzt_item_id: number }[]
    ).map((r) => r.lzt_item_id)
  );

  while (page <= 5) {
    const res = await lzt.getPurchasedOrders(lztUserId, page);
    const items = res.items ?? [];
    if (!items.length) break;

    for (const raw of items) {
      const itemId = raw.item_id;
      if (!itemId) continue;
      if (known.has(itemId)) {
        skipped++;
        continue;
      }
      try {
        const full = await lzt.getItem(itemId);
        upsertFromLztItem(full.item);
        known.add(itemId);
        imported++;
        enqueuePublishJobsForItem(itemId);
      } catch (e) {
        console.error("sync item", itemId, e);
      }
    }

    const totalPages = res.pagination?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  db.prepare(
    `INSERT INTO sync_state (key, value) VALUES ('last_lzt_sync', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = datetime('now')`
  ).run();

  return { imported, skipped };
}

export function enqueuePublishJobsForItem(lztItemId: number) {
  const row = db
    .prepare(`SELECT id FROM inventory_items WHERE lzt_item_id = ?`)
    .get(lztItemId) as { id: string } | undefined;
  if (!row) return;

  for (const jobType of ["publish_gameboost", "publish_gamermarkt"] as const) {
    const exists = db
      .prepare(
        `SELECT id FROM automation_jobs WHERE inventory_id = ? AND job_type = ? AND status IN ('pending', 'processing')`
      )
      .get(row.id, jobType);
    if (exists) continue;
    db.prepare(
      `INSERT INTO automation_jobs (id, inventory_id, job_type, status) VALUES (?, ?, ?, 'pending')`
    ).run(uuid(), row.id, jobType);
  }
}

export async function registerManualPurchase(lztItemId: number) {
  const { lzt } = clients();
  const full = await lzt.getItem(lztItemId);
  const id = upsertFromLztItem(full.item);
  enqueuePublishJobsForItem(lztItemId);
  return { inventoryId: id, item: full.item };
}

export async function fastBuyAndQueue(lztItemId: number, price: number) {
  const { lzt } = clients();
  const result = await lzt.fastBuy(lztItemId, price);
  const item = result.item;
  if (!item?.item_id) {
    throw new Error("Compra LZT sem dados do item na resposta");
  }
  const full = await lzt.getItem(item.item_id);
  const images = await lzt.getAccountImages(item.item_id);
  const merged = { ...full.item, imagePreviewLinks: images };
  const id = upsertFromLztItem(merged, full.item.loginData);
  enqueuePublishJobsForItem(item.item_id);
  return { inventoryId: id, item: merged };
}

async function publishToGameBoost(inventoryId: string) {
  const row = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(inventoryId) as {
    id: string;
    game_slug: string | null;
    generated_title: string | null;
    generated_description: string | null;
    sale_price: number | null;
    login_data: string | null;
    image_urls: string | null;
    lzt_item_id: number;
    gameboost_offer_id: string | null;
  };

  if (row.gameboost_offer_id) return;

  const { gameboost } = clients();
  if (!gameboost) throw new Error("Token GameBoost não configurado");

  let images: string[] = JSON.parse(row.image_urls ?? "[]");
  if (!images.length) {
    const { lzt } = clients();
    images = await lzt.getAccountImages(row.lzt_item_id);
    db.prepare(`UPDATE inventory_items SET image_urls = ? WHERE id = ?`).run(
      JSON.stringify(images),
      inventoryId
    );
  }

  const credentials: string[] = JSON.parse(row.login_data ?? "[]");
  if (!credentials.length) {
    throw new Error("Credenciais ausentes — sincronize novamente o item LZT");
  }

  const created = await gameboost.createOffer({
    game: row.game_slug ?? "valorant",
    title: row.generated_title ?? `Conta #${row.lzt_item_id}`,
    description: row.generated_description ?? "",
    price: row.sale_price ?? 0,
    credentials,
    image_urls: images,
    external_id: `lzt-${row.lzt_item_id}`,
    account_data: {},
  });

  const offerId = created.data.id;
  await gameboost.listOffer(offerId);

  db.prepare(
    `UPDATE inventory_items SET gameboost_offer_id = ?, status = 'listed_partial', updated_at = datetime('now') WHERE id = ?`
  ).run(offerId, inventoryId);
}

async function publishToGamerMarkt(inventoryId: string) {
  const row = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(inventoryId) as {
    id: string;
    game_slug: string | null;
    generated_title: string | null;
    generated_description: string | null;
    sale_price: number | null;
    login_data: string | null;
    image_urls: string | null;
    lzt_item_id: number;
    gamermarkt_listing_id: string | null;
  };

  if (row.gamermarkt_listing_id) return;

  const { gamermarkt } = clients();
  const credentials: string[] = JSON.parse(row.login_data ?? "[]");
  const [login = "", password = ""] = (credentials[0] ?? "").split(":");

  const result = await gamermarkt.createListing({
    title: row.generated_title ?? `Conta #${row.lzt_item_id}`,
    description: row.generated_description ?? "",
    price: row.sale_price ?? 0,
    game: row.game_slug ?? "valorant",
    images: JSON.parse(row.image_urls ?? "[]"),
    credentials: { login, password },
    external_ref: `lzt-${row.lzt_item_id}`,
  });

  const status = result.mode === "api" ? "listed_partial" : "pending_gamermarkt_manual";

  db.prepare(
    `UPDATE inventory_items SET gamermarkt_listing_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(result.listingId, status, inventoryId);
}

function refreshInventoryStatus(inventoryId: string) {
  const row = db
    .prepare(
      `SELECT gameboost_offer_id, gamermarkt_listing_id, status FROM inventory_items WHERE id = ?`
    )
    .get(inventoryId) as {
    gameboost_offer_id: string | null;
    gamermarkt_listing_id: string | null;
    status: string;
  };

  const gb = Boolean(row.gameboost_offer_id);
  const gm = Boolean(row.gamermarkt_listing_id);
  let status = row.status;
  if (gb && gm && !row.status.startsWith("pending_gamermarkt")) {
    status = "listed_all";
  } else if (gb || gm) {
    status = gb && !gm ? "listed_gameboost_only" : row.status;
  }

  db.prepare(`UPDATE inventory_items SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    inventoryId
  );
}

export async function processNextJobs(limit = 5): Promise<number> {
  const jobs = db
    .prepare(
      `SELECT * FROM automation_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
    )
    .all(limit) as {
    id: string;
    inventory_id: string;
    job_type: string;
    attempts: number;
  }[];

  for (const job of jobs) {
    db.prepare(
      `UPDATE automation_jobs SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`
    ).run(job.id);

    try {
      if (job.job_type === "publish_gameboost") {
        await publishToGameBoost(job.inventory_id);
      } else if (job.job_type === "publish_gamermarkt") {
        await publishToGamerMarkt(job.inventory_id);
      }
      refreshInventoryStatus(job.inventory_id);
      db.prepare(
        `UPDATE automation_jobs SET status = 'completed', last_error = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(job.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      db.prepare(
        `UPDATE automation_jobs SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(msg, job.id);
      db.prepare(
        `UPDATE inventory_items SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(msg, job.inventory_id);
    }
  }

  return jobs.length;
}

export function getDashboardStats() {
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) as c FROM inventory_items GROUP BY status`
    )
    .all() as { status: string; c: number }[];

  const pendingJobs = db
    .prepare(`SELECT COUNT(*) as c FROM automation_jobs WHERE status = 'pending'`)
    .get() as { c: number };

  const lastSync = db
    .prepare(`SELECT value FROM sync_state WHERE key = 'last_lzt_sync'`)
    .get() as { value: string } | undefined;

  return {
    inventoryByStatus: Object.fromEntries(counts.map((r) => [r.status, r.c])),
    pendingJobs: pendingJobs.c,
    lastLztSync: lastSync?.value ?? null,
  };
}
