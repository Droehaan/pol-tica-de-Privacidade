import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = process.env.DATABASE_PATH ?? "./data/resale-hub.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS description_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game_slug TEXT,
    title_template TEXT NOT NULL,
    description_template TEXT NOT NULL,
    markup_percent REAL NOT NULL DEFAULT 25,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    lzt_item_id INTEGER NOT NULL UNIQUE,
    game_slug TEXT,
    lzt_title TEXT,
    lzt_price REAL,
    cost_currency TEXT DEFAULT 'USD',
    login_data TEXT,
    raw_account_json TEXT,
    image_urls TEXT,
    generated_title TEXT,
    generated_description TEXT,
    sale_price REAL,
    status TEXT NOT NULL DEFAULT 'purchased',
    gameboost_offer_id TEXT,
    gamermarkt_listing_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS automation_jobs (
    id TEXT PRIMARY KEY,
    inventory_id TEXT NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (inventory_id) REFERENCES inventory_items(id)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const templateCount = db
  .prepare("SELECT COUNT(*) as c FROM description_templates")
  .get() as { c: number };

if (templateCount.c === 0) {
  db.prepare(
    `INSERT INTO description_templates (id, name, game_slug, title_template, description_template, markup_percent, is_default)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).run(
    "default-valorant",
    "Valorant padrão",
    "valorant",
    "🔥 Conta {{game}} | {{rank}} | {{skins_count}} skins",
    `Conta verificada e pronta para uso imediato.

📋 Detalhes:
• Rank: {{rank}}
• Nível: {{level}}
• Skins / agentes: {{skins_count}}
• Região: {{region}}

✅ Entrega automática após confirmação do pagamento.
⚠️ Recomendamos alterar e-mail e senha após o recebimento.

Origem interna — estoque próprio (LZT #{{lzt_item_id}}).`,
    30
  );
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function getMaskedSettings(): Record<string, string> {
  const keys = [
    "lzt_token",
    "lzt_user_id",
    "gameboost_token",
    "gamermarkt_token",
    "gamermarkt_api_key",
    "admin_password_hash",
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = getSetting(key);
    if (!v) {
      out[key] = "";
      continue;
    }
    if (key.includes("token") || key.includes("password") || key.includes("api_key")) {
      out[key] = v.length <= 8 ? "••••••••" : `${v.slice(0, 4)}…${v.slice(-4)}`;
    } else {
      out[key] = v;
    }
  }
  return out;
}
