import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Terms of Service — sheddex",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 29, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        These terms cover your use of sheddex (
        <LegalLink href="https://sheddex.com">sheddex.com</LegalLink>), a free collection of
        browser-based music practice tools built and operated by Jack Mechem. By using the site,
        you agree to these terms. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <LegalSection title="The service">
        <p>
          sheddex is provided free of charge, as a personal project, with no guarantee of
          uptime, accuracy, or continued availability. Most tools run entirely in your browser;
          creating an account is optional and currently only affects signing in — see the{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> for exactly what an account does
          and doesn&apos;t do.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <ul className="list-disc space-y-1 pl-5">
          <li>You&apos;re responsible for keeping your password (if you have one) confidential.</li>
          <li>
            You&apos;re responsible for the accuracy of the email address and any other
            information you provide.
          </li>
          <li>
            You can delete your own account at any time, from the account page — this is
            permanent and can&apos;t be undone by sheddex once done.
          </li>
          <li>
            sheddex may suspend or terminate an account for misuse of the service, at its own
            discretion.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use sheddex for anything unlawful.</li>
          <li>
            Attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to
            sheddex or the services it depends on.
          </li>
          <li>
            Use automated tools to scrape or abuse the site in a way that degrades it for other
            users.
          </li>
          <li>Impersonate another person or misrepresent your affiliation with anyone.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          Tools like Recorder and Slow Downer let you load or record your own audio. As described
          in the Privacy Policy, that content stays in your own browser&apos;s local storage —
          sheddex doesn&apos;t receive, view, or store it. You retain all rights to anything you
          create or load into these tools, and you&apos;re solely responsible for having the
          rights to use whatever audio you load (e.g. not loading copyrighted material you
          don&apos;t have permission to use).
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          The sheddex name, design, and its original source code belong to Jack Mechem. sheddex
          is built with a number of open-source libraries, each under their own license; using
          sheddex doesn&apos;t grant you any license to sheddex&apos;s own code or design beyond
          what&apos;s stated in its{" "}
          <LegalLink href="https://github.com/JackMechem/sheddex.com">
            public GitHub repository
          </LegalLink>
          , if anything.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          sheddex relies on third-party services (currently Convex, Resend, Google, and Vercel —
          see the Privacy Policy for what each is used for) to provide accounts and email. Those
          services have their own terms, and sheddex isn&apos;t responsible for their
          availability, changes, or errors.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          sheddex is provided &quot;as is&quot; and &quot;as available,&quot; without warranties
          of any kind, express or implied — including that it will be uninterrupted, error-free,
          or fit for any particular purpose. Several parts of the app (in particular, the audio
          tools) haven&apos;t been tested against every possible device, browser, or piece of
          hardware. Use it accordingly, and don&apos;t rely on it as your only copy of anything
          irreplaceable — export or back up anything important.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Jack Mechem won&apos;t be liable for any
          indirect, incidental, or consequential damages arising from your use of, or inability to
          use, sheddex — including loss of data stored in your own browser.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms, and the service itself, may change over time. Continuing to use sheddex
          after a change means you accept the updated terms. The date at the top of this page
          reflects the last change.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the State of California, USA, without regard to
          its conflict-of-laws principles, and any dispute will be handled in the state or federal
          courts located in Los Angeles County, California.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms can be sent via{" "}
          <LegalLink href="https://github.com/JackMechem/sheddex.com/issues">
            GitHub issues
          </LegalLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
