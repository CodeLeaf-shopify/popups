# Data protection notes (Leaf Popups)

Internal reference for Partner Dashboard **Data protection details** and App Store
privacy requirements. Not legal advice.

## What personal data we process

| Data | Where it lives | Purpose |
| --- | --- | --- |
| Customer email, name (via Admin API) | Shopify customers | Lead capture display |
| Consent + engagement + unique codes | Shopify customer metafield `leaf_popups.state` | Frequency, consent, discounts |
| Merchant designs, sessions, settings, aggregated stats | App PostgreSQL (Prisma) | Operate the App |

We do **not** keep a separate customer email database in Prisma.

## Retention

- Merchant app rows: while installed; deleted on `app/uninstalled` and again on `shop/redact`.
- Customer PII: remains on Shopify under the merchant’s control; honored via `customers/redact` / `customers/data_request` (no local customer rows to erase).
- Aggregated `PopupDailyStat` rows are shop/popup/day scoped, not customer-identified.

## Security posture (production)

- TLS terminated at the edge (Caddy / Cloudflare Full strict); app traffic over HTTPS.
- Postgres on the private Compose network; admin port firewalled.
- Separate development stores and databases from production.
- Staff access to hosting, Partner Dashboard, and DB limited to operators who need it; strong passwords / SSO where available.
- Backups: copy Postgres backups off the droplet (see `docs/architecture.md`); treat backup volumes as encrypted/restricted at rest where the host supports it.
- Incident response: report suspected incidents to `support@codeleaf.co`; revoke credentials, rotate secrets, contain access, notify affected merchants when required, and document timeline / remediation.

## Compliance webhooks

Registered in `shopify.app.toml` and handled by:

- `app/routes/webhooks.customers.data_request.tsx`
- `app/routes/webhooks.customers.redact.tsx`
- `app/routes/webhooks.shop.redact.tsx`

Deploy with `shopify app deploy` so production subscriptions update.

## Public privacy policy

Served at `https://leafpopups.codeleaf.co/privacy` (`app/routes/privacy.tsx`).
Use that URL in the App Store listing and Partner Dashboard.

## Partner questionnaire — intended answers

Use only after the privacy URL is live and compliance webhooks are deployed.

**Purpose:** Yes / Yes / Yes  
**Consent:** Yes / Yes / Not applicable (no sale) / Not applicable (no ADM)  
**Storage:** Yes / Yes / Yes (if host backups encrypted) / Yes / Yes  
**Access:** Yes / Yes / Yes (app + host access logs) / Yes  
**Audits:** leave blank unless you have a real audit  
