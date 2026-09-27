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

3. Generate the Prisma client and apply migrations:

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
- `NODE_ENV` — set to `production` in production

## Merchant workflow

1. Open Leaf Popups in Shopify admin.
2. Create a popup from a preset and edit its content, layout, and behavior.
3. Save the draft, preview it, and publish it.
4. Use **Enable app embed** from the app home page and save the theme.

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

The included Dockerfile installs dependencies with `npm ci`, builds the app,
runs Prisma migrations at container startup, and starts the React Router
server. The host must provide the environment variables listed above and route
traffic to the service's `PORT`.

The current Prisma datasource is a local SQLite file. That is suitable for
local development, but production data will be lost on hosts with ephemeral
filesystems, including Render services without persistent storage. Before a
production launch, use a persistent disk for a single instance or migrate the
schema and migrations to a managed database. Do not scale the current SQLite
deployment to multiple instances.

Deploying the web service does not deploy the theme extension or Shopify app
configuration. Run `npm run deploy` separately when those change.

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
write to the configured database before starting the app.

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

- implement and register Shopify's mandatory privacy compliance webhooks;
- obtain protected customer data approval for the leads workflow;
- replace SQLite or provision durable single-instance storage;
- add automated tests and CI;
- replace the inherited favicon with a Leaf Popups asset.
