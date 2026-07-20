import { useCallback, useEffect, useState } from "react";
import {
  api,
  type InventoryItem,
  type JobRow,
  type Template,
  statusLabel,
} from "./api";

type Tab = "dashboard" | "inventory" | "templates" | "settings" | "jobs";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const checkAuth = useCallback(async () => {
    try {
      await api.dashboard();
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await api.login(password);
      setAuthed(true);
      setPassword("");
      showToast("Sessão iniciada. Na primeira vez, a senha vira a senha do painel.");
    } catch {
      setLoginError("Não foi possível entrar. Verifique a senha.");
    }
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Carregando painel…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(91,140,255,0.25),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(61,214,195,0.18),transparent_35%)]" />
        <form onSubmit={onLogin} className="card relative w-full max-w-md p-8">
          <p className="font-display text-2xl font-bold">Resale Hub</p>
          <p className="mt-2 text-sm text-muted">
            Automação LZT Market → GameBoost & GamerMarkt
          </p>
          <label className="mt-6 block">
            <span className="label">Senha do painel</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Defina na primeira entrada"
              autoFocus
            />
          </label>
          {loginError && <p className="mt-2 text-sm text-red-400">{loginError}</p>}
          <button type="submit" className="btn-primary mt-6 w-full">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Resale Hub</h1>
            <p className="text-xs text-muted">Compra LZT · Publica GameBoost & GamerMarkt</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {(
              [
                ["dashboard", "Visão geral"],
                ["inventory", "Estoque"],
                ["templates", "Descrições"],
                ["jobs", "Fila"],
                ["settings", "APIs"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  tab === id ? "bg-accent text-white" : "text-muted hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="btn-ghost py-1.5"
              onClick={async () => {
                await api.logout();
                setAuthed(false);
              }}
            >
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {tab === "dashboard" && <DashboardTab showToast={showToast} />}
        {tab === "inventory" && <InventoryTab showToast={showToast} />}
        {tab === "templates" && <TemplatesTab showToast={showToast} />}
        {tab === "jobs" && <JobsTab />}
        {tab === "settings" && <SettingsTab showToast={showToast} />}
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-accent2/30 bg-panel px-4 py-3 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function DashboardTab({ showToast }: { showToast: (m: string) => void }) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [importId, setImportId] = useState("");
  const [buyId, setBuyId] = useState("");
  const [buyPrice, setBuyPrice] = useState("");

  const load = () => api.dashboard().then(setStats);
  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.syncLzt();
      showToast(`Sync LZT: ${r.imported} novos, ${r.skipped} já existentes`);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro no sync");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="Jobs na fila" value={String(stats?.pendingJobs ?? "—")} />
        <StatCard
          title="Último sync LZT"
          value={stats?.lastLztSync ? new Date(stats.lastLztSync + "Z").toLocaleString("pt-BR") : "Nunca"}
        />
        <StatCard
          title="Itens no estoque"
          value={String(
            Object.values(stats?.inventoryByStatus ?? {}).reduce((a, b) => a + b, 0) || "0"
          )}
        />
      </section>

      <section className="card grid gap-4 p-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Sincronizar compras LZT</h2>
          <p className="mt-1 text-sm text-muted">
            Busca contas em <code className="text-accent2">/user/&#123;id&#125;/orders</code> e enfileira
            publicação automática.
          </p>
          <button type="button" className="btn-primary mt-4" disabled={busy} onClick={sync}>
            {busy ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Importar item LZT manual</h2>
          <p className="mt-1 text-sm text-muted">Se você já comprou fora do painel, informe o item_id.</p>
          <div className="mt-4 flex gap-2">
            <input
              className="input"
              placeholder="item_id LZT"
              value={importId}
              onChange={(e) => setImportId(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={async () => {
                try {
                  await api.importLzt(Number(importId));
                  showToast("Item importado e fila criada");
                  load();
                } catch (e) {
                  showToast(e instanceof Error ? e.message : "Erro");
                }
              }}
            >
              Importar
            </button>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">Fast-buy LZT (API)</h2>
        <p className="mt-1 text-sm text-muted">
          Compra via <code className="text-accent2">POST /&#123;item_id&#125;/fast-buy</code> e publica nos
          marketplaces configurados.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="input"
            placeholder="item_id"
            value={buyId}
            onChange={(e) => setBuyId(e.target.value)}
          />
          <input
            className="input"
            placeholder="Preço (moeda LZT)"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              try {
                await api.fastBuy(Number(buyId), Number(buyPrice));
                showToast("Compra enfileirada");
                load();
              } catch (e) {
                showToast(e instanceof Error ? e.message : "Erro na compra");
              }
            }}
          >
            Comprar e publicar
          </button>
        </div>
      </section>

      {stats?.inventoryByStatus && (
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold">Status do estoque</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {Object.entries(stats.inventoryByStatus).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-white/5 py-2">
                <span>{statusLabel[k] ?? k}</span>
                <span className="font-mono text-accent2">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InventoryTab({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);

  const load = () => api.inventory().then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Estoque</h2>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await api.processJobs();
            showToast("Fila processada");
            load();
          }}
        >
          Processar fila
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">LZT</th>
              <th className="px-4 py-3">Título gerado</th>
              <th className="px-4 py-3">Preço venda</th>
              <th className="px-4 py-3">GameBoost</th>
              <th className="px-4 py-3">GamerMarkt</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-accent2">#{item.lzt_item_id}</td>
                <td className="max-w-xs truncate px-4 py-3">{item.generated_title}</td>
                <td className="px-4 py-3">{item.sale_price != null ? `$${item.sale_price}` : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.gameboost_offer_id ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.gamermarkt_listing_id ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-white/5 px-2 py-1 text-xs">
                    {statusLabel[item.status] ?? item.status}
                  </span>
                  {item.error_message && (
                    <p className="mt-1 text-xs text-red-400">{item.error_message}</p>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Nenhuma conta ainda. Sincronize compras LZT ou importe um item_id.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplatesTab({ showToast }: { showToast: (m: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    name: "",
    game_slug: "valorant",
    title_template: "🔥 Conta {{game}} | {{rank}}",
    description_template: "Rank: {{rank}}\nNível: {{level}}\nLZT #{{lzt_item_id}}",
    markup_percent: 30,
    is_default: false,
  });

  const load = () => api.templates().then((r) => setTemplates(r.templates));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold">Novo modelo</h2>
        <p className="mt-1 text-sm text-muted">
          Variáveis: <code className="text-accent2">{"{{rank}} {{level}} {{skins_count}} {{region}} {{game}} {{lzt_item_id}}"}</code>
        </p>
        <div className="mt-4 space-y-3">
          {(
            [
              ["name", "Nome"],
              ["game_slug", "Slug do jogo (ex: valorant)"],
              ["title_template", "Título"],
              ["markup_percent", "Markup %", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="label">{label}</span>
              <input
                className="input"
                type={type ?? "text"}
                value={String(form[key as keyof typeof form] ?? "")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    [key]: type === "number" ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label className="block">
            <span className="label">Descrição</span>
            <textarea
              className="input min-h-[140px]"
              value={form.description_template}
              onChange={(e) => setForm((f) => ({ ...f, description_template: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Modelo padrão
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await api.saveTemplate(form);
              showToast("Modelo salvo");
              load();
            }}
          >
            Salvar modelo
          </button>
        </div>
      </div>
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold">Modelos existentes</h2>
        <ul className="mt-4 space-y-4">
          {templates.map((t) => (
            <li key={t.id} className="rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{t.name}</p>
                <span className="text-xs text-muted">+{t.markup_percent}%</span>
              </div>
              <p className="mt-2 text-sm text-muted">{t.title_template}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  useEffect(() => {
    api.jobs().then((r) => setJobs(r.jobs));
  }, []);

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">LZT</th>
            <th className="px-4 py-3">Título</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Erro</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-white/5">
              <td className="px-4 py-3">{j.job_type}</td>
              <td className="px-4 py-3 font-mono">#{j.lzt_item_id}</td>
              <td className="px-4 py-3 max-w-xs truncate">{j.generated_title}</td>
              <td className="px-4 py-3">{j.status}</td>
              <td className="px-4 py-3 text-xs text-red-400">{j.last_error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({ showToast }: { showToast: (m: string) => void }) {
  const [form, setForm] = useState({
    lzt_token: "",
    lzt_user_id: "",
    gameboost_token: "",
    gamermarkt_api_key: "",
  });
  const [gmConfigured, setGmConfigured] = useState(false);

  useEffect(() => {
    api.settings().then((s) => {
      setGmConfigured(s.gamermarktApiConfigured);
    });
  }, []);

  return (
    <div className="card max-w-2xl space-y-4 p-6">
      <h2 className="font-display text-lg font-semibold">Credenciais de API</h2>
      <p className="text-sm text-muted">
        Tokens ficam no SQLite local (<code>data/resale-hub.db</code>). Use senha forte no painel.
      </p>
      {(
        [
          ["lzt_token", "LZT Market — Bearer token (escopo market)"],
          ["lzt_user_id", "LZT — seu user_id numérico"],
          ["gameboost_token", "GameBoost Partner — API key"],
          ["gamermarkt_api_key", "GamerMarkt — chave (se tiver endpoint)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block">
          <span className="label">{label}</span>
          <input
            className="input font-mono text-xs"
            type="password"
            placeholder="Cole apenas ao alterar"
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </label>
      ))}
      {!gmConfigured && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          GamerMarkt não possui API pública documentada. Defina <code>GAMERMARKT_API_BASE</code> no{" "}
          <code>.env</code> se você tiver integração privada; caso contrário, o painel gera o anúncio e
          marca como <strong>ação manual</strong> com título, descrição, preço e imagens prontos.
        </p>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={async () => {
          await api.saveSettings(form);
          showToast("Configurações salvas");
          setForm({ lzt_token: "", lzt_user_id: "", gameboost_token: "", gamermarkt_api_key: "" });
        }}
      >
        Salvar
      </button>
    </div>
  );
}
