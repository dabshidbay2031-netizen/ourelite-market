'use client';

import { usePathname, useRouter } from '@/lib/hashRouter';
import Header from '@/components/Header';

/**
 * Privacy Policy + Terms of Service, served at #/privacy and #/terms.
 * These are starter templates — have them reviewed by counsel and fill in the
 * bracketed placeholders before launch / PSP / app-store onboarding.
 */
const COMPANY = 'Mogarenta';
const CONTACT = 'support@mogarenta.com';
const UPDATED = 'June 2026';

export default function LegalPage() {
  const pathname = usePathname();
  const router   = useRouter();
  const isTerms  = pathname?.startsWith('/terms');

  return (
    <div className="page-anim">
      <Header showSearch={false} />
      <div className="legal-wrap">
        <button className="auth-back-btn" onClick={() => router.back()}>← Back</button>

        {isTerms ? (
          <article className="legal-doc">
            <h1>Terms of Service</h1>
            <p className="legal-updated">Last updated: {UPDATED}</p>

            <h2>1. Acceptance</h2>
            <p>By using {COMPANY} you agree to these Terms. If you do not agree, do not use the service.</p>

            <h2>2. Accounts</h2>
            <p>You are responsible for your account credentials and all activity under your account. Business
            and supplier accounts must provide accurate store information.</p>

            <h2>3. Orders &amp; Payments</h2>
            <p>Prices and availability are set by sellers and may change. Orders are confirmed once placed and
            priced server-side. Payment is handled by the displayed payment method/processor; {COMPANY} is not
            the merchant of record unless stated.</p>

            <h2>4. Sellers</h2>
            <p>Sellers are responsible for their listings, stock accuracy, fulfilment, taxes (incl. VAT), and
            compliance with applicable law.</p>

            <h2>5. Prohibited use</h2>
            <p>No unlawful, fraudulent, infringing, or abusive activity; no attempts to disrupt or gain
            unauthorized access to the service.</p>

            <h2>6. Liability</h2>
            <p>The service is provided “as is”. To the extent permitted by law, {COMPANY} is not liable for
            indirect or consequential damages.</p>

            <h2>7. Changes</h2>
            <p>We may update these Terms; continued use constitutes acceptance.</p>

            <h2>8. Contact</h2>
            <p>Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
          </article>
        ) : (
          <article className="legal-doc">
            <h1>Privacy Policy</h1>
            <p className="legal-updated">Last updated: {UPDATED}</p>

            <h2>1. What we collect</h2>
            <p>Account details (name, email, phone), profile and store information, orders and transaction
            history, messages you send, optional delivery location (GPS) you choose to share, and basic device/log data.</p>

            <h2>2. How we use it</h2>
            <p>To operate the marketplace: authenticate you, process and track orders, enable buyer–seller
            messaging, show store locations/directions you opt into, prevent abuse, and improve the service.</p>

            <h2>3. Sharing</h2>
            <p>Order and contact details are shared with the relevant seller to fulfil your order. We use
            processors (e.g. Supabase for database/auth/storage, the payment provider, and hosting) under their
            respective terms. We do not sell your personal data.</p>

            <h2>4. Location</h2>
            <p>Location is captured only when you tap to share it (checkout delivery point or a store’s map pin)
            and is used to show addresses/routes. You can decline at the browser prompt.</p>

            <h2>5. Retention &amp; your rights</h2>
            <p>We keep data while your account is active and as required for records/legal obligations. You may
            request access, correction, or deletion by contacting us.</p>

            <h2>6. Security</h2>
            <p>Passwords are hashed; access to data is restricted. No method is 100% secure, but we take
            reasonable measures to protect your information.</p>

            <h2>7. Contact</h2>
            <p>Privacy questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
          </article>
        )}
      </div>
    </div>
  );
}
