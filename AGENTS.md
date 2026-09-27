# Shopify app development

Leaf Popups is a Shopify React Router app for building and publishing
storefront popups. See `README.md` for setup and `docs/architecture.md` for the
system design.

- `app/popup/` owns the editor schema, commands, compiler, and Shopify
  publishing integrations.
- `app/routes/` contains the embedded admin, authentication, webhooks, and
  signed app-proxy endpoints.
- `extensions/leaf-popups-embed/` is the storefront runtime. Keep its renderer
  contract aligned with `app/popup/types.ts` and `app/popup/compile.ts`.
- Prisma stores sessions and merchant-authored popup data. Customer engagement
  belongs in Shopify customer metafields under `leaf_popups`.
- Use npm and commit `package-lock.json`.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.
