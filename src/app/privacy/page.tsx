import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Trio Recruiting",
  description: "Privacy Policy for Trio Recruiting",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Trio Recruiting
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground hover:underline">
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-foreground hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 prose prose-slate dark:prose-invert prose-headings:scroll-mt-20">
        <h1 className="text-3xl font-bold tracking-tight not-prose mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground not-prose mb-8">
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
          <p>
            This Privacy Policy describes how Trio Recruiting (“<strong>we</strong>,”
            “<strong>us</strong>,” “<strong>our</strong>”) collects, uses, stores, and
            shares information when you use Trio Recruiting (the “
            <strong>Service</strong>”) — a multi-tenant recruiting and talent-CRM
            platform that may include candidate and company records, pipelines, jobs,
            careers pages, email integrations, AI assistance, and related tools.
          </p>
          <p>
            By using the Service, you agree to this Policy. If you do not agree, do not
            use the Service.
          </p>

          <h2 className="text-xl font-semibold pt-4">1. Who this applies to</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Customer users</strong> — recruiters, hiring managers, and admins
              of an organization (“<strong>Customer</strong>”) that has a tenant account.
            </li>
            <li>
              <strong>Applicants / website visitors</strong> — people who view public
              careers pages or submit applications via Customer-hosted careers links.
            </li>
            <li>
              <strong>Site visitors</strong> — people who visit marketing/login pages.
            </li>
          </ul>
          <p>
            Customers are typically the <strong>data controller</strong> for candidate,
            contact, and client data they enter into their tenant. We act as a{" "}
            <strong>service provider / processor</strong> for that Customer data, except
            for account/billing and platform operations data we control.
          </p>

          <h2 className="text-xl font-semibold pt-4">2. Information we collect</h2>
          <p>
            <strong>A. Account &amp; authentication.</strong> Name, email, password or
            auth tokens (via our identity provider, e.g. Amazon Cognito), role/membership
            within a tenant, session cookies, and security logs (sign-in, invite accept).
          </p>
          <p>
            <strong>B. Customer CRM / ATS content.</strong> Candidates, contacts,
            companies/clients, jobs, pipelines, notes, stages, resumes/files, event
            timelines, sequences, and similar records the Customer chooses to store.
          </p>
          <p>
            <strong>C. Communications.</strong> If you connect Gmail, Outlook, or
            similar: OAuth tokens and metadata needed to send/receive mail on your
            behalf, plus message content you choose to send or process through the
            Service.
          </p>
          <p>
            <strong>D. AI &amp; research features.</strong> Prompts, uploads, tool
            results, and related usage logs when you use AI assistants or research tools.
            If you use bring-your-own-key (BYOK) providers, requests may be sent to those
            providers under your keys and their policies.
          </p>
          <p>
            <strong>E. Integrations &amp; third-party enrichment.</strong> Data retrieved
            from services you enable (e.g. people/company search, web research), subject
            to those providers’ terms.
          </p>
          <p>
            <strong>F. Device &amp; usage.</strong> IP address, browser/device type,
            pages and API usage, approximate location from IP, cookies/local storage for
            session and preferences, error and performance logs.
          </p>
          <p>
            <strong>G. Careers / applications.</strong> When applicants apply via public
            careers pages: application fields, resume/CV, and any information the
            Customer’s form requests.
          </p>
          <p>
            We do not intentionally collect sensitive categories (e.g. health, precise
            biometrics) except if a Customer or applicant voluntarily submits them in
            free-text or resume content.
          </p>

          <h2 className="text-xl font-semibold pt-4">3. How we use information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide, secure, and improve the Service</li>
            <li>Authenticate users and enforce tenant isolation</li>
            <li>
              Process Customer instructions (CRM updates, emails, AI tasks, sequences)
            </li>
            <li>Operate public careers pages for the Customer’s brand</li>
            <li>Monitor abuse, rate limits, reliability, and support</li>
            <li>Comply with law and enforce our Terms of Service</li>
            <li>Communicate product and security notices</li>
          </ul>
          <p>
            We do <strong>not</strong> sell personal information.
          </p>

          <h2 className="text-xl font-semibold pt-4">4. AI processing</h2>
          <p>
            AI features may send relevant content (prompts, notes, resumes, search
            context) to model providers (e.g. AWS Bedrock / Claude, or your BYOK
            providers). Use of AI is optional where the product allows. Do not submit data
            you are not authorized to process. Model providers may process data under
            their terms; BYOK traffic is governed primarily by your agreement with that
            provider.
          </p>

          <h2 className="text-xl font-semibold pt-4">5. How we share information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Service providers</strong> — cloud hosting (e.g. Vercel, AWS),
              email, analytics, error monitoring, AI model hosts — under
              contractual/security obligations.
            </li>
            <li>
              <strong>Integrations you enable</strong> — Google, Microsoft, enrichment
              and research APIs, and similar services.
            </li>
            <li>
              <strong>Customer admins</strong> — tenant members with appropriate roles may
              access tenant data.
            </li>
            <li>
              <strong>Legal</strong> — if required by law, valid legal process, or to
              protect rights and safety.
            </li>
            <li>
              <strong>Business transfers</strong> — merger, acquisition, or asset sale,
              with notice where required.
            </li>
          </ul>
          <p>We do not share Customer tenant content with other Customers.</p>

          <h2 className="text-xl font-semibold pt-4">6. Cookies &amp; similar tech</h2>
          <p>
            We use essential cookies and session storage for login and security.
            Preference cookies may store UI settings. You can block cookies in your
            browser; some features (including sign-in) may not work.
          </p>

          <h2 className="text-xl font-semibold pt-4">7. Data retention</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Account and tenant data: while the account is active and as needed for
              legitimate business or legal purposes after closure.
            </li>
            <li>Backups and logs: for a limited period.</li>
            <li>
              Customer may delete or export records via the product (where available);
              residual copies may remain in backups until rotated.
            </li>
            <li>
              Applicant data is retained under the Customer’s instructions and our
              retention practices.
            </li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">8. Security</h2>
          <p>
            We use industry-standard measures including HTTPS, authentication, access
            controls, and cloud security features. No method of transmission or storage is
            100% secure.
          </p>

          <h2 className="text-xl font-semibold pt-4">9. Your rights &amp; choices</h2>
          <p>
            Depending on your location, you may have rights to access, correct, delete,
            export, or object to certain processing.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Customer users:</strong> manage profile/settings in-app; contact
              your tenant admin for CRM data.
            </li>
            <li>
              <strong>Applicants:</strong> contact the employer/Customer that received
              your application; we will assist the Customer as processor.
            </li>
            <li>
              <strong>Privacy requests to us:</strong> use the contact below. We may need
              to verify identity and route requests to the correct Customer.
            </li>
          </ul>
          <p>
            California residents (and similar laws): we do not sell or “share” personal
            information for cross-context behavioral advertising as those terms are
            commonly defined. You may request know/delete/correct subject to exemptions.
          </p>

          <h2 className="text-xl font-semibold pt-4">10. International transfers</h2>
          <p>
            We and our providers may process data in the United States and other
            countries. Where required, we use appropriate transfer mechanisms.
          </p>

          <h2 className="text-xl font-semibold pt-4">11. Children</h2>
          <p>
            The Service is not directed to children under 16 (or higher age where
            required). We do not knowingly collect data from children.
          </p>

          <h2 className="text-xl font-semibold pt-4">12. Changes</h2>
          <p>
            We may update this Policy. We will post the new effective date on this page
            and, for material changes, provide additional notice when appropriate.
          </p>

          <h2 className="text-xl font-semibold pt-4">13. Contact</h2>
          <p>
            Privacy inquiries:
            <br />
            Email:{" "}
            <a
              href="mailto:michaeljameswalshiii@gmail.com"
              className="text-primary hover:underline"
            >
              michaeljameswalshiii@gmail.com
            </a>
            <br />
            Service: Trio Recruiting
          </p>
        </section>

        <p className="mt-12 text-sm text-muted-foreground not-prose">
          Also see our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
