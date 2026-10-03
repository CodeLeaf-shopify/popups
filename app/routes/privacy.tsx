import type { CSSProperties } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Leaf Popups" },
  {
    name: "description",
    content:
      "How Leaf Popups collects, uses, stores, and deletes personal data for Shopify merchants and their customers.",
  },
];

const updated = "October 3, 2026";

export default function PrivacyPolicy() {
  return (
    <main style={styles.main}>
      <article style={styles.article}>
        <p style={styles.eyebrow}>Leaf Popups by Codeleaf</p>
        <h1 style={styles.h1}>Privacy Policy</h1>
        <p style={styles.muted}>Last updated: {updated}</p>

        <p>
          This Privacy Policy describes how Codeleaf (&quot;we&quot;, &quot;us&quot;, or
          &quot;our&quot;) collects, uses, and shares information in connection with the
          Leaf Popups Shopify application (the &quot;App&quot;). It applies to merchants
          who install the App and to personal data of merchants&apos; customers that the
          App processes to provide popup campaigns, lead capture, and related features.
        </p>

        <h2 style={styles.h2}>1. Who we are</h2>
        <p>
          Leaf Popups is operated by Codeleaf. Contact:{" "}
          <a href="mailto:support@codeleaf.co">support@codeleaf.co</a>. App site:{" "}
          <a href="https://leafpopups.codeleaf.co">https://leafpopups.codeleaf.co</a>.
        </p>

        <h2 style={styles.h2}>2. Data we process</h2>
        <h3 style={styles.h3}>Merchant / shop data</h3>
        <ul style={styles.list}>
          <li>Shopify shop domain and session tokens needed to authenticate the App</li>
          <li>Popup designs, behavior settings, publication manifests, and A/B test metadata</li>
          <li>Aggregated campaign analytics (views, clicks, submits, dismissals by popup/day)</li>
          <li>Billing plan status read from Shopify App Pricing</li>
        </ul>
        <h3 style={styles.h3}>Customer / visitor data</h3>
        <ul style={styles.list}>
          <li>
            Email addresses and optional marketing consent when a visitor submits a
            popup form (stored on Shopify customer records)
          </li>
          <li>
            Engagement state such as shown, dismissed, and submitted timestamps, consent
            metadata, and unique discount codes (stored in the Shopify customer metafield{" "}
            <code>leaf_popups.state</code>)
          </li>
          <li>
            Anonymous browser-local state for frequency control until a visitor is
            identified by a submission
          </li>
        </ul>
        <p>
          We do <strong>not</strong> maintain a separate customer database outside Shopify.
          The App&apos;s Leads view reads customer emails and metafield state from the
          Shopify Admin API.
        </p>

        <h2 style={styles.h2}>3. Purposes of processing</h2>
        <ul style={styles.list}>
          <li>Provide, operate, and improve popup campaigns for the merchant&apos;s store</li>
          <li>Capture leads and apply marketing consent when the visitor opts in</li>
          <li>Issue and remember discount codes associated with campaigns</li>
          <li>Enforce frequency, targeting, and audience rules</li>
          <li>Show merchants captured leads and campaign analytics inside the App</li>
          <li>Authenticate the App, bill through Shopify App Pricing, and meet legal obligations</li>
        </ul>
        <p>
          We process only the minimum personal data needed for these purposes and do not
          use customer personal data for unrelated advertising or sell it to third parties.
        </p>

        <h2 style={styles.h2}>4. Legal bases and roles</h2>
        <p>
          For customer personal data processed through the App, the merchant is typically
          the data controller and Codeleaf acts as a processor / service provider on the
          merchant&apos;s behalf, subject to the Shopify Partner Program Agreement and
          applicable law. Merchants are responsible for providing required notices and
          obtaining consent on their storefronts where required.
        </p>

        <h2 style={styles.h2}>5. Consent and marketing</h2>
        <p>
          Popup forms may include an optional consent checkbox configured by the merchant.
          When a visitor consents, the App records consent metadata and may set email
          marketing consent on the Shopify customer. We respect consent decisions recorded
          through the App and do not sell personal data. Automated decision-making with
          legal or similarly significant effects is not part of the App.
        </p>

        <h2 style={styles.h2}>6. Where data is stored</h2>
        <ul style={styles.list}>
          <li>
            <strong>Shopify:</strong> customer records, customer metafields, shop
            metafields (published campaign index), Files CDN payloads, and discount codes
          </li>
          <li>
            <strong>App database (PostgreSQL):</strong> merchant designs, sessions,
            publication state, settings, billing cache, and aggregated stats — not customer
            email lists
          </li>
        </ul>
        <p>
          Production traffic is served over HTTPS/TLS. Database access is restricted to the
          application environment. Test and production environments use separate stores and
          databases.
        </p>

        <h2 style={styles.h2}>7. Retention</h2>
        <ul style={styles.list}>
          <li>
            Merchant app data is kept while the App is installed and needed to provide the
            service
          </li>
          <li>
            After uninstall, shop-scoped app data is deleted from our database (and again on
            Shopify&apos;s <code>shop/redact</code> webhook)
          </li>
          <li>
            Customer personal data on Shopify follows the merchant&apos;s Shopify retention
            practices and Shopify customer deletion / redaction requests
          </li>
          <li>
            We respond to Shopify mandatory compliance webhooks (
            <code>customers/data_request</code>, <code>customers/redact</code>,{" "}
            <code>shop/redact</code>) within required timeframes
          </li>
        </ul>

        <h2 style={styles.h2}>8. Sharing</h2>
        <p>
          We share data with Shopify as required to run the App on the Shopify platform, and
          with infrastructure providers that host the App and database under our
          instructions. We do not sell personal data. We may disclose information if required
          by law or to protect the rights, safety, and security of merchants, customers, or
          Codeleaf.
        </p>

        <h2 style={styles.h2}>9. Security</h2>
        <p>
          We use industry-standard measures including TLS in transit, access controls for
          production systems, separation of test and production data, and least-privilege
          staff access. No method of transmission or storage is completely secure; please
          contact us promptly if you believe there has been unauthorized access.
        </p>

        <h2 style={styles.h2}>10. Your rights and requests</h2>
        <p>
          Merchants and customers may have rights to access, correct, delete, or export
          personal data under applicable law. Customers should contact the merchant (store
          owner) first. Merchants can contact us at{" "}
          <a href="mailto:support@codeleaf.co">support@codeleaf.co</a>. We also honor
          Shopify-mediated data request and erasure webhooks.
        </p>

        <h2 style={styles.h2}>11. International transfers</h2>
        <p>
          Data may be processed in countries where Shopify, Codeleaf, or our hosting
          providers operate. Where required, we rely on appropriate safeguards for such
          transfers.
        </p>

        <h2 style={styles.h2}>12. Children</h2>
        <p>
          The App is directed to merchants operating online stores and is not intended for
          children. We do not knowingly collect personal data from children through the App.
        </p>

        <h2 style={styles.h2}>13. Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. The &quot;Last updated&quot;
          date at the top will change when we do. Continued use of the App after an update
          constitutes acceptance of the revised policy where permitted by law.
        </p>

        <h2 style={styles.h2}>14. Contact</h2>
        <p>
          Questions about this policy or our data practices:{" "}
          <a href="mailto:support@codeleaf.co">support@codeleaf.co</a>
        </p>
      </article>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100vh",
    margin: 0,
    padding: "48px 20px 80px",
    background: "linear-gradient(180deg, #f3f6f2 0%, #eef2f7 45%, #f7f4ef 100%)",
    color: "#1a211c",
    fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    lineHeight: 1.65,
  },
  article: {
    maxWidth: 720,
    margin: "0 auto",
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(26,33,28,0.08)",
    borderRadius: 16,
    padding: "40px 36px",
    boxShadow: "0 18px 50px rgba(26,33,28,0.06)",
  },
  eyebrow: {
    margin: "0 0 8px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 13,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#3d5a45",
  },
  h1: {
    margin: "0 0 8px",
    fontSize: "2.25rem",
    lineHeight: 1.15,
    fontWeight: 650,
  },
  h2: {
    margin: "2rem 0 0.75rem",
    fontSize: "1.25rem",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: 650,
  },
  h3: {
    margin: "1.25rem 0 0.5rem",
    fontSize: "1.05rem",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: 600,
  },
  muted: {
    margin: "0 0 1.5rem",
    color: "#5c665f",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 14,
  },
  list: {
    paddingLeft: "1.25rem",
    margin: "0.5rem 0 1rem",
  },
};
