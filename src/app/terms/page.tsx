import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Trio Recruiting",
  description: "Terms of Service for Trio Recruiting",
  robots: { index: true, follow: true },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Trio Recruiting
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link
              href="/privacy"
              className="hover:text-foreground hover:underline"
            >
              Privacy Policy
            </Link>
            <Link href="/login" className="hover:text-foreground hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Effective date: July 19, 2026 · Service: Trio Recruiting (
          <a
            href="https://turnkey-optimization.vercel.app"
            className="text-primary hover:underline"
          >
            turnkey-optimization.vercel.app
          </a>
          )
        </p>

        <section className="space-y-4 text-[15px] leading-relaxed text-foreground/90">
          <h2 className="text-xl font-semibold pt-2">1. Agreement</h2>
          <p>
            These Terms of Service (“<strong>Terms</strong>”) govern access to and use of
            Trio Recruiting and related websites, APIs, and services (the “
            <strong>Service</strong>”). By creating an account, inviting users, or using
            the Service, you agree to these Terms. If you use the Service on behalf of an
            organization, you represent that you have authority to bind that organization
            (the “<strong>Customer</strong>”).
          </p>

          <h2 className="text-xl font-semibold pt-4">2. The Service</h2>
          <p>
            Trio Recruiting is a multi-tenant software platform for recruiting workflows,
            including CRM/ATS-style records, pipelines, jobs, careers pages, optional
            email and AI features, and integrations. Features may change over time. We may
            offer free, trial, or paid plans.
          </p>

          <h2 className="text-xl font-semibold pt-4">3. Accounts &amp; eligibility</h2>
          <p>
            You must provide accurate registration information and keep credentials
            confidential. You are responsible for activity under your account. Notify us
            promptly of unauthorized use. You must be legally able to enter a binding
            contract and not prohibited from using the Service under applicable law.
          </p>

          <h2 className="text-xl font-semibold pt-4">
            4. Customer content &amp; responsibilities
          </h2>
          <p>
            “<strong>Customer Content</strong>” means data submitted to the Service by or
            for Customer (candidates, contacts, notes, resumes, emails, prompts, etc.).
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Customer retains ownership of Customer Content.</li>
            <li>
              Customer grants us a limited license to host, process, transmit, display,
              and backup Customer Content solely to provide and improve the Service and as
              otherwise instructed by Customer.
            </li>
            <li>
              Customer is responsible for: lawful collection and use of personal data;
              employment/recruiting compliance; obtaining required notices/consents;
              accuracy of content; user permissions within the tenant; and configurations
              (including AI, email, and third-party keys).
            </li>
            <li>
              Customer must not upload malware or content that is illegal, infringing, or
              that Customer has no right to process.
            </li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Probe, scan, or breach security or authentication</li>
            <li>
              Reverse engineer the Service except where prohibited by law from restricting
              that
            </li>
            <li>
              Abuse rate limits, scrape in a way that harms the Service, or resell access
              without permission
            </li>
            <li>
              Use the Service to spam, harass, discriminate unlawfully, or violate
              employment or privacy laws
            </li>
            <li>Misrepresent identity or affiliation</li>
            <li>Interfere with other tenants or platform integrity</li>
          </ul>
          <p>
            We may suspend or terminate access for violations or risk to the Service or
            others.
          </p>

          <h2 className="text-xl font-semibold pt-4">6. AI features</h2>
          <p>
            AI outputs may be inaccurate, incomplete, or biased. You must review outputs
            before relying on them for hiring or other decisions. You are responsible for
            human oversight of employment-related decisions. Do not use AI features to
            violate anti-discrimination or privacy laws. BYOK providers are used at your
            risk and under your agreements with those providers; we are not responsible
            for third-party model behavior or their data handling beyond our integration.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Third-party services</h2>
          <p>
            Integrations (Google, Microsoft, enrichment/search providers, AI hosts,
            hosting providers, etc.) are subject to their own terms and privacy policies.
            We are not responsible for third-party services. Disabling an integration may
            limit features.
          </p>

          <h2 className="text-xl font-semibold pt-4">
            8. Careers pages &amp; applicants
          </h2>
          <p>
            Public careers pages may be available without a Trio Recruiting account.
            Applicants’ relationships regarding job applications are primarily with the
            Customer/employer. Customer is responsible for job postings, screening
            practices, and applicant communications.
          </p>

          <h2 className="text-xl font-semibold pt-4">9. Fees &amp; billing</h2>
          <p>
            Paid plans are subject to the pricing, invoices, and payment terms presented
            at purchase or in an order form. Fees are generally non-refundable except
            where required by law or expressly stated. We may change prices with notice
            for subsequent terms. Non-payment may result in suspension.
          </p>

          <h2 className="text-xl font-semibold pt-4">10. Intellectual property</h2>
          <p>
            We and our licensors own the Service, software, branding, and documentation.
            These Terms do not transfer IP ownership to you. Feedback you provide may be
            used by us without obligation.
          </p>

          <h2 className="text-xl font-semibold pt-4">11. Confidentiality</h2>
          <p>
            Each party may receive confidential information of the other. The recipient
            will protect it with reasonable care and use it only for purposes of the
            relationship, except for information that is public, independently developed,
            or required to be disclosed by law.
          </p>

          <h2 className="text-xl font-semibold pt-4">12. Privacy</h2>
          <p>
            Our Privacy Policy explains how we handle personal information and is
            incorporated by reference:{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              https://turnkey-optimization.vercel.app/privacy
            </Link>
            .
          </p>

          <h2 className="text-xl font-semibold pt-4">13. Disclaimers</h2>
          <p className="uppercase text-sm tracking-wide">
            The Service is provided “as is” and “as available.” To the maximum extent
            permitted by law, we disclaim all warranties, express or implied, including
            merchantability, fitness for a particular purpose, and non-infringement. We do
            not warrant uninterrupted or error-free operation or that AI or enrichment
            results will be accurate.
          </p>

          <h2 className="text-xl font-semibold pt-4">14. Limitation of liability</h2>
          <p className="uppercase text-sm tracking-wide">
            To the maximum extent permitted by law, we will not be liable for indirect,
            incidental, special, consequential, or punitive damages, or lost profits,
            revenue, data, or goodwill. Our aggregate liability arising out of these Terms
            or the Service will not exceed the greater of (a) amounts paid by Customer to
            us for the Service in the twelve (12) months before the claim or (b) one
            hundred U.S. dollars (US $100) if no fees were paid. Some jurisdictions do not
            allow certain limits; in those cases, limits apply to the fullest extent
            allowed.
          </p>

          <h2 className="text-xl font-semibold pt-4">15. Indemnity</h2>
          <p>
            Customer will defend and indemnify us against claims arising from Customer
            Content, Customer’s use of the Service in violation of law or these Terms, or
            Customer’s recruiting/employment practices, except to the extent caused by our
            willful misconduct.
          </p>

          <h2 className="text-xl font-semibold pt-4">16. Term &amp; termination</h2>
          <p>
            These Terms apply while you use the Service. You may stop using the Service
            and request account closure. We may suspend or terminate for breach, risk,
            non-payment, or discontinuation of the Service with reasonable notice where
            practical. Provisions that should survive (IP, liability limits, indemnity,
            etc.) will survive.
          </p>

          <h2 className="text-xl font-semibold pt-4">
            17. Changes to the Service or Terms
          </h2>
          <p>
            We may modify the Service and these Terms. Material changes will be posted
            with an updated effective date (and notice when appropriate). Continued use
            after the effective date constitutes acceptance, except where law requires
            otherwise.
          </p>

          <h2 className="text-xl font-semibold pt-4">18. Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of Florida, USA, excluding
            conflict-of-law rules, unless a written order form says otherwise. Exclusive
            venue for disputes will be state or federal courts in Florida, except where
            prohibited.
          </p>

          <h2 className="text-xl font-semibold pt-4">19. Miscellaneous</h2>
          <p>
            If any provision is unenforceable, the rest remains in effect. Failure to
            enforce is not a waiver. You may not assign these Terms without our consent;
            we may assign in connection with a corporate transaction. These Terms plus any
            order form and Privacy Policy are the entire agreement regarding the Service.
          </p>

          <h2 className="text-xl font-semibold pt-4">20. Contact</h2>
          <p>
            Legal / terms:
            <br />
            Email:{" "}
            <a
              href="mailto:michaeljameswalshiii@gmail.com"
              className="text-primary hover:underline"
            >
              michaeljameswalshiii@gmail.com
            </a>
            <br />
            Service site:{" "}
            <a
              href="https://turnkey-optimization.vercel.app"
              className="text-primary hover:underline"
            >
              https://turnkey-optimization.vercel.app
            </a>
          </p>
        </section>

        <p className="mt-12 text-sm text-muted-foreground">
          Also see our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
