# Leaf Popups

Leaf Popups is an embedded Shopify app for building and publishing storefront
popups. Merchants can create email capture, discount, exit-intent, and
announcement campaigns, preview them in the admin, and deliver them through a
single theme app embed.

## How it works

- The embedded admin and popup builder live in `app/`.
- Prisma stores Shopify sessions, popup drafts, and publication state.
- Publishing uploads compiled popup payloads to Shopify Files and updates a
  shop metafield manifest.
- `extensions/leaf-popups-embed/` reads that manifest and renders eligible
  campaigns on the storefront.
- `app/routes/proxy.$.tsx` handles storefront events, submissions, and signed
  draft previews through the Shopify app proxy.
- Customer engagement state is stored in customer metafields under the
  `leaf_popups` namespace.

See [docs/architecture.md](docs/architecture.md) for the data flow and the
contracts shared by the builder, preview, and storefront renderer.

## Requirements

- Node.js `>=20.19 <22` or `>=22.12`
- npm
- A PostgreSQL database (Neon in development and production)
- A Shopify Partner account and development store
- Shopify CLI

## First-time setup

1. Install dependencies:

   ```shell
   npm install
   ```

2. Link the repository to the intended Shopify app:

   ```shell
   npm run config:link
   ```

3. Set `DATABASE_URL` (Neon pooled connection) and `DIRECT_URL` (Neon direct
   connection, used for migrations) in `.env`, then generate the Prisma client
   and apply migrations:

   ```shell
   npm run setup
   ```

4. Start Shopify's local development environment:

   ```shell
   npm run dev
   ```

Shopify CLI supplies the app credentials and tunnel URL during local
development. Press `P` in the CLI after startup to open and install the app on
the selected store.

## Environment variables

Copy `.env.example` only when running the web process outside `shopify app dev`.
Never commit real credentials.

- `SHOPIFY_API_KEY` — app client ID
- `SHOPIFY_API_SECRET` — app client secret
- `SHOPIFY_APP_URL` — public HTTPS origin for the web app
- `SCOPES` — comma-separated scopes matching `shopify.app.toml`
- `SHOP_CUSTOM_DOMAIN` — optional custom shop domain
- `DATABASE_URL` — Neon pooled connection string (host contains `-pooler`)
  used by the app
- `DIRECT_URL` — Neon direct connection string used by Prisma migrations
- `APP_DOMAIN` — hostname served by Caddy, without a URL scheme
- `HOST`, `PORT` — production server bind address and port
- `NODE_ENV` — set to `production` in production
- `PRO_UNLOCKED` — testing only. Set to `true` to grant Pro features without a subscription. Unset, `false`, or any other value keeps Shopify App Pricing.

## Merchant workflow

1. Open Leaf Popups in Shopify admin.
2. Create a popup from a preset and edit its content, layout, and behavior.
3. Save the draft, preview it, and publish it.
4. Use **Enable Leaf Popups in the theme editor** from the app home page or
   Settings, confirm the **Leaf Popups** toggle is on, and click **Save** in
   the theme editor.

The app embed is enabled once per theme. Individual popup availability is
controlled by the published manifest, not by adding separate theme blocks.

## Useful commands

```shell
npm run dev          # Shopify CLI development environment
npm run build        # Production React Router build
npm run start        # Serve an existing production build
npm run setup        # Generate Prisma client and deploy migrations
npm run lint         # ESLint
npm run typecheck    # React Router type generation and TypeScript checks
npm run deploy       # Deploy Shopify app configuration and extensions
```

## Deployment

Production runs with Docker Compose on a DigitalOcean droplet: `app` (React
Router + Prisma migrations) and `caddy` (HTTPS). The database is hosted on
Neon.
Shopify configuration and the theme extension ship separately with
`npm run deploy`.

Follow [docs/deployment.md](docs/deployment.md) for the full step-by-step
guide: droplet and firewall setup, DNS, `.env` values, first start, Shopify
deploy, smoke test, updates, backups, and troubleshooting.

Quick update on the droplet:

```shell
git pull && docker compose up -d --build
```

## Repository map

- `app/components/` — popup editor UI
- `app/popup/` — document schema, commands, compiler, publishing, and Shopify
  integrations
- `app/routes/` — embedded admin, auth, webhooks, and app proxy endpoints
- `extensions/leaf-popups-embed/` — Liquid app embed and storefront renderer
- `prisma/` — database schema and migrations
- `shopify.app.toml` — scopes, webhooks, and app proxy configuration

## Troubleshooting

### Prisma tables do not exist

Run `npm run setup`. In deployment environments, make sure the service can
connect to `DATABASE_URL` and `DIRECT_URL` before starting the app.

### Embedded navigation loses the session

Use React Router navigation and the redirects returned by
`authenticate.admin`. Plain document navigation can drop embedded-app session
context.

### Theme editor opens without activating the embed

Confirm that the repository is linked to the correct Shopify app and that the
theme extension has been deployed. The merchant must still save the theme
after opening the activation link.

## Production follow-ups

Before App Store submission or production launch:

- obtain protected customer data approval for the leads workflow;
- deploy so privacy compliance webhooks and `/privacy` are live in production;
- add automated tests and CI;
- replace the inherited favicon with a Leaf Popups asset.
