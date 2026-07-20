# Resale Hub

Painel web para **automatizar revenda de contas**: compras na **LZT Market** (API) e publicação automática na **GameBoost** (API oficial) e **GamerMarkt** (adaptador + fila manual quando não houver API).

## Fluxo

1. Configure tokens em **APIs** (LZT + GameBoost obrigatórios para automação completa).
2. **Sincronizar compras LZT** — lê `GET /user/{user_id}/orders`, importa itens novos.
3. Para cada conta: gera **título/descrição** a partir dos modelos (placeholders `{{rank}}`, `{{level}}`, etc.), calcula **preço com markup**, busca **imagens** do anúncio LZT.
4. Enfileira jobs `publish_gameboost` e `publish_gamermarkt`.
5. GameBoost: `POST /v2/account-offers/create` + `POST /v2/account-offers/{id}/list`.
6. GamerMarkt: tenta API se `GAMERMARKT_API_BASE` + chave estiverem definidos; senão status `pending_gamermarkt_manual`.

Também é possível **fast-buy** (`POST /{item_id}/fast-buy`) direto pelo painel.

## Requisitos

- Node.js 20+
- Conta LZT com token API (escopo **market**)
- Conta GameBoost Partner com API key

## Instalação

```bash
cp .env.example .env
npm install
npm run dev
```

- API: `http://localhost:3000`
- UI (dev): `http://localhost:5173` (proxy para `/api`)

Produção:

```bash
npm run build
npm start
```

Na primeira entrada no painel, a senha que você digitar vira a senha de administrador.

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão 3000) |
| `APP_SECRET` | Assinatura do cookie de sessão |
| `DATABASE_PATH` | Caminho do SQLite |
| `LZT_API_BASE` | Padrão `https://prod-api.lzt.market` |
| `GAMEBOOST_API_BASE` | Padrão `https://api.gameboost.com` |
| `GAMERMARKT_API_BASE` | URL base opcional da GamerMarkt |

## Compliance

- **GameBoost**: só liste contas que você já possui; a automação compra na LZT **antes** de publicar.
- **GamerMarkt**: verifique o contrato de usuário da plataforma sobre revenda e origem do estoque.
- Armazene credenciais com segurança; não exponha o painel na internet sem HTTPS e firewall.

## Documentação das APIs

- [LZT Market API](https://lzt-market.readme.io/reference)
- [GameBoost API](https://docs.gameboost.com/api/reference/account-offers/create-an-account-offer-new-format)

## Estrutura

- `server/` — Express, SQLite, clientes LZT/GameBoost/GamerMarkt, fila de jobs
- `web/` — React + Vite + Tailwind (painel em português)
