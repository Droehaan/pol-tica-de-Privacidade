import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import {
  getMaskedSettings,
  getSetting,
  setSetting,
  db,
} from "../db.js";
import {
  fastBuyAndQueue,
  getDashboardStats,
  getInventoryDetail,
  listInventory,
  processNextJobs,
  registerManualPurchase,
  syncPurchasesFromLzt,
} from "../services/pipeline.js";
import { login, setSessionCookie, clearSessionCookie } from "../middleware/auth.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "resale-hub" });
});

apiRouter.post("/auth/login", (req, res) => {
  const schema = z.object({ password: z.string().min(4) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Senha inválida" });
  }
  if (!login(parsed.data.password)) {
    return res.status(401).json({ error: "Senha incorreta" });
  }
  setSessionCookie(res);
  return res.json({ ok: true });
});

apiRouter.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

apiRouter.get("/settings", (_req, res) => {
  res.json({
    masked: getMaskedSettings(),
    gamermarktApiConfigured: Boolean(
      getSetting("gamermarkt_api_key") && process.env.GAMERMARKT_API_BASE
    ),
  });
});

const settingsSchema = z.object({
  lzt_token: z.string().optional(),
  lzt_user_id: z.string().optional(),
  gameboost_token: z.string().optional(),
  gamermarkt_api_key: z.string().optional(),
  gamermarkt_token: z.string().optional(),
});

apiRouter.put("/settings", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;
  for (const [key, value] of Object.entries(data)) {
    if (value && !value.includes("…")) {
      setSetting(key, value);
    }
  }
  res.json({ ok: true, masked: getMaskedSettings() });
});

apiRouter.get("/dashboard", (_req, res) => {
  res.json(getDashboardStats());
});

apiRouter.get("/inventory", (_req, res) => {
  res.json({ items: listInventory() });
});

apiRouter.get("/inventory/:id", (req, res) => {
  const item = getInventoryDetail(req.params.id);
  if (!item) return res.status(404).json({ error: "Item não encontrado" });
  res.json({ item });
});

apiRouter.post("/sync/lzt-purchases", async (_req, res) => {
  try {
    const result = await syncPurchasesFromLzt();
    await processNextJobs(10);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

apiRouter.post("/lzt/fast-buy", async (req, res) => {
  const schema = z.object({
    item_id: z.number().int().positive(),
    price: z.number().positive(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await fastBuyAndQueue(parsed.data.item_id, parsed.data.price);
    await processNextJobs(10);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

apiRouter.post("/lzt/import/:itemId", async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(itemId)) {
    return res.status(400).json({ error: "itemId inválido" });
  }
  try {
    const result = await registerManualPurchase(itemId);
    await processNextJobs(10);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

apiRouter.post("/jobs/process", async (req, res) => {
  const limit = Number(req.body?.limit ?? 10);
  const processed = await processNextJobs(Math.min(limit, 50));
  res.json({ processed });
});

apiRouter.get("/templates", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM description_templates ORDER BY name`).all();
  res.json({ templates: rows });
});

const templateSchema = z.object({
  name: z.string().min(1),
  game_slug: z.string().optional().nullable(),
  title_template: z.string().min(1),
  description_template: z.string().min(1),
  markup_percent: z.number().min(0).max(500),
  is_default: z.boolean().optional(),
});

apiRouter.post("/templates", (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const id = uuid();
  const d = parsed.data;
  if (d.is_default) {
    db.prepare(`UPDATE description_templates SET is_default = 0`).run();
  }
  db.prepare(
    `INSERT INTO description_templates (id, name, game_slug, title_template, description_template, markup_percent, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    d.name,
    d.game_slug ?? null,
    d.title_template,
    d.description_template,
    d.markup_percent,
    d.is_default ? 1 : 0
  );
  res.json({ id });
});

apiRouter.put("/templates/:id", (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  if (d.is_default) {
    db.prepare(`UPDATE description_templates SET is_default = 0`).run();
  }
  db.prepare(
    `UPDATE description_templates SET name = ?, game_slug = ?, title_template = ?,
     description_template = ?, markup_percent = ?, is_default = ? WHERE id = ?`
  ).run(
    d.name,
    d.game_slug ?? null,
    d.title_template,
    d.description_template,
    d.markup_percent,
    d.is_default ? 1 : 0,
    req.params.id
  );
  res.json({ ok: true });
});

apiRouter.get("/jobs", (_req, res) => {
  const jobs = db
    .prepare(
      `SELECT j.*, i.lzt_item_id, i.generated_title FROM automation_jobs j
       JOIN inventory_items i ON i.id = j.inventory_id
       ORDER BY j.created_at DESC LIMIT 100`
    )
    .all();
  res.json({ jobs });
});
