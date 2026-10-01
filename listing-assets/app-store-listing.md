# Custom Popups with A/B Testing — Shopify App Store listing draft

This draft follows Shopify's current listing limits and reflects features implemented in the app.

## Basic information

### App name

Leaf Popups with A/B testing

> Naming risk: This fits Shopify's 30-character limit, but it is generic rather than brand-led and shares no words with the current `leaf-popups` TOML name. Shopify can reject it under its unique, consistent naming requirements. If you keep it, align the app's configured name before submission.

### Primary language

English

### App card subtitle

Design, target, and test custom storefront popups

### App introduction

Build custom modal popups and announcement bars, then compare variants with A/B testing.

### App details

Build custom modal popups and announcement bars with a visual editor and live storefront preview. Add text, images, buttons, forms, coupons, countdowns, columns, and layout blocks, or start from a template. Control triggers, schedules, frequency, page rules, devices, audience settings, and campaign priority. Publish through one theme app embed, compare variants with A/B tests, and review views, clicks, submissions, and dismissals.

## Feature list

1. Visual popup builder with live desktop and mobile previews.
2. Text, images, buttons, forms, coupons, countdowns, and layouts.
3. Page, device, schedule, frequency, and audience targeting.
4. Shared or unique discount codes for popup campaigns.
5. A/B tests and analytics for views, clicks, submissions, and dismissals.

## Discovery

### Category and tags

- Primary: Store design → Notifications → Pop-ups
- Secondary: Store design → Notifications → Banners

For structured category features, select only dashboard options matching these implemented capabilities:

- Custom popup design
- Email capture forms
- Discount popups
- Exit-intent triggers
- Announcement bars
- Display scheduling
- Page and device targeting
- Frequency controls
- Mobile responsive design
- A/B testing
- Engagement analytics

### Search terms

Enter these as five separate terms:

1. custom popups
2. A/B testing
3. announcement bar
4. discount popup
5. exit intent

### Search engine title

Custom Popups with A/B Testing

### Search engine meta description

Design custom modal popups and announcement bars, control targeting and triggers, preview campaigns, run A/B tests, and review engagement.

## Integrations

Leave this section empty. The app has no direct third-party integrations, and Shopify should not be listed as an integration.

## Pricing

Select **Recurring charge** and mark the Free plan as free. Configure the actual Pro price in Shopify App Pricing rather than listing copy or application code.

### Free

- Publish up to three popups
- Visual builder and storefront preview
- Modal and announcement bar formats
- Custom content blocks, forms, and shared discount codes
- Immediate, delay, and scroll triggers
- Path, frequency, and audience controls

### Pro

- Unlimited published popups
- Exit-intent triggers
- Campaign scheduling
- Desktop or mobile targeting
- Unique discount codes
- A/B testing
- Engagement analytics

## Merchant eligibility

- Required sales channel: Online Store
- POS required: No
- Geographic restrictions: None
- Store currency restrictions: None
- Shipping restrictions: None
- Supported merchant UI language: English

State that the Online Store sales channel is required because the app renders popups through a theme app embed.

## Demo store

### URL

`https://<development-store-domain>/<demo-page>`

### Demo instructions

Open the linked storefront page and wait for the promotional popup. Interact with its call-to-action, then browse another page to view the announcement bar. The demo can also include an email form to show submission and consent handling. If a popup has already been dismissed, use a private browsing window to reset visitor frequency.

Replace the placeholder with a direct, public development-store page. Add a storefront password in the dedicated dashboard field when required.

## Listing links

Replace each placeholder with a dedicated public page:

- Developer website: `https://<your-domain>/`
- Privacy policy: `https://<your-domain>/privacy`
- Support portal: `https://<your-domain>/support`
- FAQ: `https://<your-domain>/help`
- Documentation: `https://<your-domain>/docs`
- Tutorial: `https://<your-domain>/docs/getting-started`
- Changelog: `https://<your-domain>/changelog`
- Support email: `support@<your-domain>`

The privacy policy and working support contact are required.

## Media

### App icon

Provide a 1200 × 1200 PNG or JPEG with a simple text-free app mark, square padding, and no Shopify trademarks.

### Feature media

Provide a unique 1600 × 900 static feature image or a two-to-three-minute promotional video. Suggested feature-image copy:

- Heading: Build the right popup for every storefront moment
- Supporting line: Design, target, publish, and review campaigns from one workspace
- Alt text: Custom popup builder displaying a promotional modal with editable content blocks.

Do not reuse one of the gallery screenshots as feature media.

### Screenshots

Use the four files and alt text in `screenshots/README.md`.

## App review instructions

1. Install Custom Popups with A/B Testing on the supplied development store.
2. Select the Pro plan on Shopify's hosted plan page to access every review path.
3. Open **Popups** and create a custom popup from a blank design or template.
4. Edit its content and design, switch desktop and mobile previews, then publish it.
5. Use **Enable Leaf Popups in the theme editor** and save the theme app embed.
6. Open the storefront preview and trigger the popup.
7. Add or open a form popup, submit a test customer email, then confirm it appears under **Leads**.
8. Create and publish a second popup to test priority and conflict settings.
9. Start an A/B test, generate storefront interactions, and review the result under **Analytics**.
10. Open **Settings** to test pause, audience, path exclusion, conflict, and default-style controls.

No external service credentials are required.

## Data-access disclosure

The app requests customer access to save popup engagement and consent state and to display captured customer emails in the Leads view. It also requests discount access to create campaign codes and file access to publish popup payloads. Apply for protected customer data access before submitting the app.

## Submission blockers to resolve

- Replace the placeholder application and authentication URLs in `shopify.app.toml`.
- Align the configured app name with the listing name and confirm the generic name passes Shopify's uniqueness check.
- Implement and register Shopify's mandatory privacy compliance webhooks.
- Obtain protected customer data approval for customer names and email addresses.
- Publish the theme app extension and verify the theme embed on the demo store.
- Add the public privacy, support, documentation, and demo-store URLs above.
- Upload a compliant app icon and unique feature-media asset.
