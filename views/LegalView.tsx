'use client';

import { usePathname, useRouter } from '@/lib/hashRouter';
import Header from '@/components/Header';
import { SUBSCRIPTION_PRICES, SUBSCRIPTION_TRIAL_DAYS, SUBSCRIPTION_CURRENCY } from '@/lib/subscription';

/**
 * Privacy Policy + Terms of Use, served at #/privacy and #/terms.
 * These are starter templates — have them reviewed by counsel and fill in the
 * bracketed placeholders before launch / PSP / app-store onboarding.
 */
const COMPANY = 'Hamar Mall';
const CONTACT = 'support@mogarenta.com';
const UPDATED = 'July 2026';
const BIZ = `$${SUBSCRIPTION_PRICES.business.toFixed(2)}`;
const SUP = `$${SUBSCRIPTION_PRICES.supplier.toFixed(2)}`;

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
            <h1>Terms of Use &amp; Agreement</h1>
            <p className="legal-updated">Last updated: {UPDATED}</p>

            <h2>1. Acceptance</h2>
            <p>By creating an account or using {COMPANY} (the “Service”) you agree to these Terms of Use. If you
            do not agree, do not use the Service. If you use the Service on behalf of a business, you confirm you
            are authorised to bind that business to these Terms.</p>

            <h2>2. Accounts</h2>
            <p>You are responsible for your account credentials and all activity under your account. Business and
            supplier accounts must provide accurate store, contact, and payout information and keep it up to date.</p>

            <h2>3. Seller subscription &amp; fees</h2>
            <p>Business and supplier accounts require a paid subscription to access the store dashboard and selling
            tools. The subscription fees are:</p>
            <ul>
              <li><strong>Business account — {BIZ} {SUBSCRIPTION_CURRENCY}</strong> per month.</li>
              <li><strong>Supplier account — {SUP} {SUBSCRIPTION_CURRENCY}</strong> per month.</li>
            </ul>
            <p>The fee is charged when you activate your store, through the displayed mobile-money payment method
            (Sifalo Pay — EVC Plus / ZAAD / SAHAL, eDahab, or Premier Wallet). Customer (“shopper”) and field-agent
            accounts are free. Fees are stated in {SUBSCRIPTION_CURRENCY} and exclude any charges levied by your
            wallet provider. We may change fees on notice; changes apply to your next billing cycle.</p>

            <h2>4. {SUBSCRIPTION_TRIAL_DAYS}-day money-back guarantee</h2>
            <p>Every seller subscription includes a <strong>{SUBSCRIPTION_TRIAL_DAYS}-day money-back guarantee</strong>.
            You may request a full refund of your subscription fee at any time within {SUBSCRIPTION_TRIAL_DAYS} days
            of payment, directly from the Billing page — no reason required.{' '}
            <strong>After {SUBSCRIPTION_TRIAL_DAYS} days the payment is non-refundable.</strong> When a refund is issued, your subscription is cancelled and
            store-dashboard access is locked until you pay again. Refunds are returned to the wallet used for payment;
            processing times depend on the payment provider. This guarantee applies to the subscription fee only and
            not to any other charges, order payments, or third-party fees.</p>

            <h2>5. Non-payment &amp; suspension</h2>
            <p>If a subscription is unpaid, expired, or refunded, the store dashboard, point-of-sale, and selling
            features are locked until payment is made. Your public storefront may also be hidden while inactive.
            Data is retained per Section 9 during any locked period.</p>

            <h2>6. Orders &amp; payments</h2>
            <p>Prices and availability are set by sellers and may change. Orders are confirmed once placed and are
            priced server-side. Order payments are handled by the displayed payment method/processor; {COMPANY} is
            not the merchant of record for order transactions unless expressly stated.</p>

            <h2>7. Seller responsibilities</h2>
            <p>Sellers are responsible for their listings, stock accuracy, fulfilment and delivery, customer service,
            taxes (including any VAT), and compliance with applicable law.</p>

            <h2>8. Prohibited use</h2>
            <p>No unlawful, fraudulent, infringing, or abusive activity; no manipulation of pricing, balances,
            reviews, referrals, or fees; and no attempts to disrupt or gain unauthorised access to the Service.</p>

            <h2>9. Data &amp; privacy</h2>
            <p>Your use of the Service is also governed by our <a href="#/privacy">Privacy Policy</a>. We retain
            account and transaction records as required for accounting and legal obligations.</p>

            <h2>10. Liability</h2>
            <p>The Service is provided “as is”. To the extent permitted by law, {COMPANY} is not liable for indirect,
            incidental, or consequential damages, and our total liability for any claim relating to the subscription
            is limited to the fees you paid in the {SUBSCRIPTION_TRIAL_DAYS} days before the claim.</p>

            <h2>11. Changes</h2>
            <p>We may update these Terms; we will post the updated date above, and continued use after changes take
            effect constitutes acceptance.</p>

            <h2>12. Contact</h2>
            <p>Questions about these Terms or billing: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
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
