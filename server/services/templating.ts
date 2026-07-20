import { db } from "../db.js";
import type { LztAccountItem } from "../clients/lzt.js";

export type TemplateRow = {
  id: string;
  name: string;
  game_slug: string | null;
  title_template: string;
  description_template: string;
  markup_percent: number;
  is_default: number;
};

function pickTemplate(gameSlug?: string | null): TemplateRow {
  if (gameSlug) {
    const specific = db
      .prepare(
        `SELECT * FROM description_templates WHERE game_slug = ? ORDER BY is_default DESC LIMIT 1`
      )
      .get(gameSlug) as TemplateRow | undefined;
    if (specific) return specific;
  }
  const fallback = db
    .prepare(`SELECT * FROM description_templates WHERE is_default = 1 LIMIT 1`)
    .get() as TemplateRow;
  return fallback;
}

function getParam(item: LztAccountItem, keys: string[]): string {
  const params = item.params ?? {};
  for (const key of keys) {
    const v = params[key];
    if (v != null && v !== "") return String(v);
  }
  return "N/D";
}

function inferGameSlug(item: LztAccountItem): string {
  const title = (item.title ?? "").toLowerCase();
  const cat = String(item.category_id ?? "");
  if (title.includes("valorant") || cat === "13") return "valorant";
  if (title.includes("league") || title.includes("lol") || cat === "1") return "league-of-legends";
  if (title.includes("steam") || cat === "3") return "steam";
  if (title.includes("fortnite") || cat === "12") return "fortnite";
  if (title.includes("pubg") || cat === "14") return "pubg-mobile";
  return "other";
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function buildListingContent(
  item: LztAccountItem,
  costPrice: number,
  template?: TemplateRow
): {
  gameSlug: string;
  title: string;
  description: string;
  salePrice: number;
  markupPercent: number;
} {
  const tpl = template ?? pickTemplate(inferGameSlug(item));
  const gameSlug = tpl.game_slug ?? inferGameSlug(item);

  const vars: Record<string, string> = {
    game: gameSlug.replace(/-/g, " ").toUpperCase(),
    rank: getParam(item, ["rank", "valorant_rank", "lol_rank"]),
    level: getParam(item, ["level", "account_level"]),
    skins_count: getParam(item, ["skins", "skin_count", "skins_count", "agents_count"]),
    region: getParam(item, ["region", "country", "riot_region"]),
    lzt_item_id: String(item.item_id),
    lzt_title: item.title ?? "",
    original_price: String(costPrice),
  };

  const apply = (text: string) =>
    text.replace(PLACEHOLDER_REGEX, (_, key: string) => vars[key.toLowerCase()] ?? "");

  const salePrice = Math.ceil(costPrice * (1 + tpl.markup_percent / 100));

  return {
    gameSlug,
    title: apply(tpl.title_template).trim(),
    description: apply(tpl.description_template).trim(),
    salePrice,
    markupPercent: tpl.markup_percent,
  };
}

export function extractCredentials(item: LztAccountItem): string[] {
  const login = item.loginData?.login;
  const password = item.loginData?.password;
  if (login && password) {
    return [`${login}:${password}`];
  }
  if (item.loginData?.raw) {
    return [item.loginData.raw];
  }
  return [];
}
