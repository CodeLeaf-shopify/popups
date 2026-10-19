# Deploying Leaf Popups with Docker on a DigitalOcean droplet

Production runs on a single DigitalOcean droplet with Docker Compose. The
stack in `compose.yaml` has three services:

| Service | What it does |
| --- | --- |
| `app` | Builds the React Router app from the `Dockerfile`, applies Prisma migrations on start, and serves on port 3000 inside the Docker network. |
| `db` | PostgreSQL 16. Data lives in the `postgres_data` named volume. |
| `caddy` | Terminates HTTPS on ports 80/443, gets a Let's Encrypt certificate for `APP_DOMAIN`, and proxies to `app`. Certificates live in the `caddy_data` volume. |

Docker deploys only the web app. Shopify configuration (`shopify.app.toml`:
URLs, scopes, webhooks, app proxy) and the theme app extension are deployed
separately with the Shopify CLI from your development machine (step 7).

Placeholders used below:

- `APP_DOMAIN`: the public hostname, for example `leafpopups.codeleaf.co`.
- `DROPLET_IP`: the droplet's public IPv4 address.
- `YOUR_IP`: your own public IP, for SSH and database access.

---

## 1. Create the droplet

1. In DigitalOcean, create a droplet:
   - **Image:** Ubuntu 24.04 LTS.
   - **Size:** at least 2 GB RAM. The Docker build runs `npm ci` and a Vite
     build, which can run out of memory on 1 GB. If you use 1 GB, add swap
     (step 2.4).
   - **Authentication:** SSH key. Don't use a password.
   - Turn on **Monitoring**. **Backups** is optional but recommended.
2. Create a **Cloud Firewall** (Networking → Firewalls) and attach it to the
   droplet:

   | Type | Protocol | Port | Sources |
   | --- | --- | --- | --- |
   | SSH | TCP | 22 | `YOUR_IP` only |
   | HTTP | TCP | 80 | All IPv4, All IPv6 |
   | HTTPS | TCP | 443 | All IPv4, All IPv6 |
   | HTTP/3 | UDP | 443 | All IPv4, All IPv6 |
   | PostgreSQL | TCP | 5432 | `YOUR_IP` only. Omit this rule if you don't need direct DB access. |

   > Docker publishes ports by writing iptables rules directly, which bypasses
   > `ufw` on the droplet. The DigitalOcean Cloud Firewall sits outside the
   > droplet, so it is what actually protects port 5432. Never open 5432 to
   > `0.0.0.0/0` or `::/0`.

## 2. Prepare the server

SSH in as root (`ssh root@DROPLET_IP`) and run:

1. Update the system and turn on automatic security updates:

   ```bash
   apt update && apt upgrade -y
   apt install -y unattended-upgrades git
   dpkg-reconfigure -plow unattended-upgrades
   ```

2. Install Docker Engine and the Compose plugin from Docker's repository:

   ```bash
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   systemctl enable --now docker
   docker compose version
   ```

3. Optional: create a non-root deploy user:

   ```bash
   adduser deploy
   usermod -aG docker deploy
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
   ```

   Then reconnect as `ssh deploy@DROPLET_IP`.

4. Only for droplets with 1 GB RAM, add 2 GB of swap:

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile
   mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

## 3. Point DNS at the droplet

Create an `A` record for `APP_DOMAIN` → `DROPLET_IP`. Add an `AAAA` record too
if IPv6 is on.

If the domain uses **Cloudflare**:

1. Create the record as **DNS only** (grey cloud) first, so Caddy can reach
   Let's Encrypt and get its certificate on first start.
2. Once `https://APP_DOMAIN/health` returns `ok` (step 6), switch the record
   to **Proxied** (orange cloud).
3. Set SSL/TLS mode to **Full (strict)**. Never use "Flexible": it causes
   redirect loops and breaks Shopify's HMAC-verified requests.

Check that DNS has propagated before continuing:

```bash
dig +short APP_DOMAIN
```

## 4. Get the code onto the droplet

```bash
cd ~
git clone https://github.com/CodeLeaf-shopify/popups.git leaf-popups
cd leaf-popups
```

The repository is private, so authenticate with a
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
(read-only, recommended) or a fine-grained personal access token.

## 5. Create the production `.env`

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in every value below. Generate the database password with
`openssl rand -hex 32` so it is URL-safe.

| Variable | Value |
| --- | --- |
| `APP_DOMAIN` | `leafpopups.codeleaf.co`. Hostname only, no `https://`. |
| `SHOPIFY_APP_URL` | `https://leafpopups.codeleaf.co`. Must match `application_url` in `shopify.app.toml`. |
| `SHOPIFY_API_KEY` | Client ID. Same as `client_id` in `shopify.app.toml`. |
| `SHOPIFY_API_SECRET` | Client secret from Partner Dashboard → Apps → Leaf Popups → Client credentials. |
| `SCOPES` | `read_customers,read_discounts,write_customers,write_discounts,write_files`. Must match `shopify.app.toml`. |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `POSTGRES_DB` | e.g. `leaf_popups` |
| `POSTGRES_USER` | e.g. `leaf_popups` |
| `POSTGRES_PASSWORD` | The generated password. |
| `DATABASE_URL` | `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@db:5432/POSTGRES_DB?schema=public`. The host must be `db`. |
| `POSTGRES_BIND_ADDRESS` | `127.0.0.1` keeps Postgres off the internet; connect over an SSH tunnel. Use `0.0.0.0` only together with the firewall rule from step 1. |
| `POSTGRES_PORT` | `5432` |
| `SHOPIFY_PARTNER_ORG_ID` | The number in your Partner Dashboard URL: `partners.shopify.com/<ORG_ID>/…`. |
| `SHOPIFY_PARTNER_API_ACCESS_TOKEN` | Partner Dashboard → Settings → Partner API clients → create a client with **Manage apps** permission. |
| `SHOPIFY_APP_GID` | `gid://shopify/App/<APP_ID>`, where `<APP_ID>` is the number in the app's Partner Dashboard URL. |
| `SHOPIFY_APP_HANDLE` | The app handle in the hosted plan page URL (defaults to `leaf-popups`). |
| `PRO_UNLOCKED` | `false`. Never `true` in production. |

> **The three `SHOPIFY_PARTNER_*` / `SHOPIFY_APP_GID` values are required.**
> Without them the app can't reliably detect paid plans, and Pro merchants
> (and App Store reviewers) stay locked out of Pro features such as Analytics.

## 6. Build and start the stack

```bash
docker compose up -d --build
```

The first build takes a few minutes. Then verify:

```bash
docker compose ps                          # all three services "running"; app and db "healthy"
docker compose logs -f app                 # expect "prisma migrate deploy" output, then the server listening on 3000
docker compose logs caddy | grep -i certificate   # expect "certificate obtained successfully"
curl -fsS https://APP_DOMAIN/health         # prints: ok
```

If you're using Cloudflare, switch the DNS record to **Proxied** now (step 3).

## 7. Deploy the Shopify configuration and theme extension

Run this from your development machine, in this repository, not on the
droplet:

```bash
npm install
npm run deploy
```

This releases `shopify.app.toml` (production URLs, scopes, webhooks, app proxy
`/apps/leaf-popups` → `https://APP_DOMAIN/proxy`) and the
`leaf-popups-embed` theme app extension as a new app version.

## 8. Partner Dashboard settings

1. **Pricing:** the Pro plan's handle must be `pro`. Set its **welcome link**
   to `/app/plans` so the app re-checks the plan as soon as a merchant
   subscribes.
2. **Listing → Sales channel requirements:** select **Merchant must have
   online store**.
3. **Protected customer data:** request access for customer name and email
   (used by Leads).

## 9. Smoke test on a development store

1. Install the app from the Partner Dashboard (Test your app). OAuth should
   finish inside Shopify admin and land on **Popups**.
2. Create a popup from blank and one from a template. The editor opens with no
   "Application Error".
3. Publish a popup, enable the app embed from **Enable Leaf Popups in the theme
   editor**, save the theme, and check that the popup shows on the storefront.
4. Go to **Plans** and choose Pro. Dev stores aren't charged. After the
   redirect, **Analytics** is unlocked. Check which source decided the plan:

   ```bash
   docker compose logs app | grep "Leaf Popups plan"
   ```

   You want to see `pro (Partner API)`.

---

## Updating to a new version

On the droplet:

```bash
cd ~/leaf-popups
git pull
docker compose up -d --build
docker image prune -f                       # remove old image layers
curl -fsS https://APP_DOMAIN/health
```

Migrations run automatically when the `app` container starts. If the release
changes `shopify.app.toml` or `extensions/`, also run `npm run deploy` from
your development machine (step 7).

**Rollback:** `git checkout <previous-commit> && docker compose up -d --build`.
Prisma migrations don't roll back automatically, so restore a backup if a
migration has to be undone.

## Operations

```bash
docker compose ps                           # service status
docker compose logs -f --tail=200 app       # app logs
docker compose restart app                  # restart only the app (e.g. after editing .env)
docker compose up -d                        # re-apply .env changes to all services
```

After you edit `.env`, use `docker compose up -d`, not `restart`. `restart`
doesn't reload environment variables.

The `postgres_data` and `caddy_data` volumes survive rebuilds and
`docker compose down`. **Never run `docker compose down --volumes`** unless you
mean to delete every shop's data and the TLS certificates.

### Database access

Connect from TablePlus or psql over an SSH tunnel (works with
`POSTGRES_BIND_ADDRESS=127.0.0.1`):

- **SSH:** `deploy@DROPLET_IP` with your key.
- **Database host:** `127.0.0.1`, port `5432`, using `POSTGRES_DB`,
  `POSTGRES_USER` and `POSTGRES_PASSWORD`.

If you expose 5432 directly instead, the connection works only from the IP
allowed in the Cloud Firewall, and it isn't TLS-encrypted.

### Backups

Create a compressed logical backup:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > leaf-popups-$(date +%F).dump
```

Copy backups off the droplet (for example to DigitalOcean Spaces) and test
restores regularly. Droplet backups and snapshots are extra protection, not a
substitute for database dumps.

Restore into the existing database:

```bash
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < leaf-popups-YYYY-MM-DD.dump
docker compose start app
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Caddy logs show certificate errors | DNS doesn't point at the droplet yet, ports 80/443 are closed in the Cloud Firewall, or the Cloudflare record is proxied before the first certificate was issued. |
| Cloudflare error 526 | SSL/TLS mode is Full (strict) but Caddy has no valid certificate yet. Set the record to DNS-only until Caddy has one. |
| `app` keeps restarting | Check `docker compose logs app`. It's usually a wrong `DATABASE_URL` (the host must be `db`) or a missing `SHOPIFY_API_SECRET`. |
| Build killed / exit code 137 | The droplet ran out of memory. Add swap (step 2.4) or resize. |
| Pro merchants see Free features | Partner API variables are missing or wrong. Check `docker compose logs app \| grep -i "plan"`. |
| Popups don't appear on the storefront | The theme extension wasn't deployed (`npm run deploy`), or the merchant didn't save the theme after enabling the embed. |
| App proxy / form submissions return 404 | `shopify.app.toml` changes weren't deployed, or the `[app_proxy]` URL doesn't match `APP_DOMAIN`. |
