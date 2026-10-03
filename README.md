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
- PostgreSQL 16 or Docker
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

3. Set `DATABASE_URL` to a PostgreSQL database, then generate the Prisma
   client and apply migrations:

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
- `DATABASE_URL` — PostgreSQL connection string; use host `db` inside Compose
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — credentials used to
  initialize the Compose database
- `POSTGRES_BIND_ADDRESS`, `POSTGRES_PORT` — host listener used by database
  administration tools
- `APP_DOMAIN` — hostname served by Caddy, without a URL scheme
- `HOST`, `PORT` — production server bind address and port
- `NODE_ENV` — set to `production` in production
- `PRO_UNLOCKED` — testing only. Set to `true` to grant Pro features without a subscription. Unset, `false`, or any other value keeps Shopify App Pricing.

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

The production stack in `compose.yaml` runs three services:

- `app` builds and serves the React Router application after applying Prisma
  migrations;
- `db` runs PostgreSQL 16 with a named volume;
- `caddy` obtains an origin certificate and proxies HTTPS traffic to the app.

### One-time DigitalOcean setup

1. Install Docker Engine and the Docker Compose plugin on the droplet, then
   clone this repository.
2. Copy `.env.example` to `.env`. Set the Shopify credentials, production
   domain, and a unique URL-safe database password of at least 32 characters.
   Repeat that password in `DATABASE_URL`; its host must remain `db`.
3. Create a proxied Cloudflare DNS `A` record from `APP_DOMAIN` to the droplet.
   Set Cloudflare SSL/TLS mode to **Full (strict)**.
4. Attach a DigitalOcean Cloud Firewall with these inbound rules:
   - TCP 80 and 443 from all IPv4 and IPv6 addresses;
   - TCP 22 from your administration IPs;
   - TCP 5432 only from your laptop's static public IP.
5. Replace the placeholder application and redirect URLs in
   `shopify.app.toml` with the production origin, then run `npm run deploy`
   from a trusted development machine. Shopify configuration and the theme
   extension are not deployed by Docker.

Docker-published ports can bypass uncomplicated host-firewall assumptions.
The DigitalOcean Cloud Firewall rule for port 5432 is required; never allow
that port from `0.0.0.0/0` or `::/0`.

Start or update the complete stack:

```shell
docker compose up -d --build
```

For PostgreSQL by itself during local development:

```shell
docker compose up -d db
```

Inspect its status and logs:

```shell
docker compose ps
docker compose logs -f app caddy db
```

Prisma migrations are idempotently applied whenever the app container starts.
The PostgreSQL and Caddy named volumes survive container replacement. Do not
use `docker compose down --volumes` unless all stored data may be deleted.

### Connect with TablePlus

Use the droplet's public IP, port `5432`, and the values of `POSTGRES_DB`,
`POSTGRES_USER`, and `POSTGRES_PASSWORD`. The connection succeeds only from
the source IP allowlisted in the DigitalOcean Cloud Firewall. Update that rule
if your public IP changes.

This direct connection is IP-restricted and password-authenticated, but the
stack does not configure PostgreSQL transport TLS. Use TablePlus's SSH tunnel
mode through the droplet when connecting across an untrusted network or when
encrypted database transport is required.

### Backups

Create a compressed logical backup:

```shell
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > leaf-popups.dump
```

Copy backups off the droplet to durable object storage and regularly test
restores. Droplet snapshots are useful additional protection, not a substitute
for database backups.

For a full restore, stop the app first and restore into the existing database:

```shell
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < leaf-popups.dump
docker compose start app
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
connect to `DATABASE_URL` before starting the app.

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
- add automated tests and CI;
- replace the inherited favicon with a Leaf Popups asset.
