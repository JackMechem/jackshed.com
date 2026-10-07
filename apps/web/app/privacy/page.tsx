import { LegalLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata = {
  title: "Privacy Policy — sheddex",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 29, 2026">
      <p className="text-sm leading-relaxed text-foreground/90">
        sheddex (<LegalLink href="https://sheddex.com">sheddex.com</LegalLink>) is a free
        collection of browser-based music practice tools, built and operated by Jack Mechem as a
        personal, non-commercial project. This page explains what data sheddex collects, why, and
        what your options are. It isn&apos;t written in dense legal boilerplate on purpose — if
        anything here is unclear, use the contact method at the bottom and ask.
      </p>

      <LegalSection title="The short version">
        <p>
          Recorder and Slow Downer&apos;s actual recordings and loaded audio files always stay in
          your own browser and are never sent anywhere, account or not. Every other tool&apos;s
          data (tune lists, settings, chord charts, practice history and stats) works the same way
          when you&apos;re signed out — but if you create an account, that data syncs to
          sheddex&apos;s servers instead, so it follows you to another device signed into the same
          account. Signing in is entirely optional; every tool works fully without one. There&apos;s
          also an entirely separate, opt-in public profile (a username, picture, instruments, and
          your tunes) that only becomes visible to anyone — including people without an account —
          if you explicitly turn it on; see &quot;Public profiles&quot; below. There are no ads, no
          analytics, and no trackers anywhere on this site.
        </p>
      </LegalSection>

      <LegalSection title="Data that stays on your device">
        <p>
          Signed out, every tool on sheddex — the trainers, the metronome, Chord Charts, Slow
          Downer, the Recorder — stores its data (settings, tune lists, imported chord charts,
          practice history, recordings, and any audio files you load) directly in your
          browser&apos;s own local storage, using standard browser technology (localStorage and
          IndexedDB). None of it is uploaded to sheddex&apos;s servers or seen by Jack Mechem. It
          stays on your device until you clear it yourself (through your browser&apos;s own
          settings, or a tool&apos;s own reset controls where available) — clearing your
          browser&apos;s site data for sheddex.com will delete it.
        </p>
        <p>
          Recorder&apos;s and Slow Downer&apos;s actual audio (recordings and loaded files) always
          works this way, signed in or not — see &quot;Data collected if you create an
          account&quot; below for what does sync.
        </p>
      </LegalSection>

      <LegalSection title="Data collected if you create an account">
        <p>Creating an account is entirely optional — every tool works fully without one.</p>
        <p>If you sign up with email and password, sheddex collects and stores:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address.</li>
          <li>
            Your password, but never in a readable form — it&apos;s run through a one-way hashing
            function before it&apos;s stored, and can&apos;t be recovered from the stored value,
            by sheddex or anyone else.
          </li>
        </ul>
        <p>If you sign in with Google instead, Google shares with sheddex:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The email address and name associated with your Google account.</li>
          <li>
            Whatever else Google&apos;s own sign-in screen tells you it&apos;s sharing at the time
            you sign in — sheddex only requests the minimum needed to create an account (your
            email), nothing broader.
          </li>
        </ul>
        <p>
          Confirming an action by email (creating an account, changing a password, deleting an
          account) briefly stores a one-time confirmation code, hashed the same way a password is,
          which expires automatically after 15 minutes whether or not it&apos;s used.
        </p>
        <p>
          If you&apos;re signed in, sheddex also stores your tool data on its servers instead of
          only in your browser — tune lists, each tool&apos;s settings, imported chord charts, and
          the trainers&apos; practice history/stats. Signing in doesn&apos;t merge what was already
          in your browser with your account — it switches over to whatever&apos;s already saved to
          the account, so anything only saved locally before you signed in stays only in that
          browser&apos;s local storage unless you re-add it while signed in. Recorder&apos;s
          recordings and Slow Downer&apos;s loaded audio files are the one exception — those stay
          local-only regardless of sign-in state (see &quot;Data that stays on your device&quot;
          above).
        </p>
      </LegalSection>

      <LegalSection title="Public profiles">
        <p>
          Separate from the account data above, sheddex lets you optionally set up a public
          profile — a username (unrelated to how you sign in), a picture, and the instruments you
          play — from the Public Profile tab of the account page. None of this is visible to
          anyone else, and it doesn&apos;t appear in the Community search page, until you
          explicitly turn &quot;Make profile public&quot; on there.
        </p>
        <p>
          Once public, your username, picture, instruments, and <strong>every tune</strong> in
          your Tunes and Tunes to Learn lists (name, tempos, keys, and time signature — never any
          notes you&apos;ve written on a tune) can be viewed by anyone at its own page
          (sheddex.com/u/your-username) and found via the Community search page — both reachable
          without an account. There&apos;s no way to show only some of your tunes; making your
          profile public shows all of them. A public profile also shows who you follow and who
          follows you (see &quot;Follows&quot; below) to anyone who can view the profile at all,
          under that same rule. Turning a profile back to private, or deleting it entirely, removes
          this visibility immediately — the account page lets you do either any time.
        </p>
        <p>
          <strong>Tunes to Learn.</strong> Separate from your own Jam Practice tune list, sheddex
          also lets you keep a personal &quot;Tunes to Learn&quot; list — built by copying tunes
          you see on other people&apos;s public profiles onto your own list, from the account
          page&apos;s Tunes to Learn tab. This list is stored on sheddex&apos;s servers the same
          way your other synced tool data is, and is shown on your own public profile under the
          same public/private rule as everything else described here.
        </p>
        <p>
          <strong>Follows.</strong> If you follow another public profile, that&apos;s stored as a
          simple record of who follows whom. Your own Following and Followers lists are always
          visible to you on the account page; on a public profile, both lists are visible to
          anyone who can view that profile, the same as the rest of it. Following requires being
          signed in; there&apos;s no notification sent to the account you follow.
        </p>
        <p>
          Profile pictures are uploaded files, stored via Convex&apos;s file storage (see
          &quot;Who else sees your data&quot; below) — resized in your own browser before
          uploading, so only the resized version ever reaches sheddex&apos;s servers.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and browser storage">
        <p>
          sheddex doesn&apos;t use advertising or tracking cookies. Browser storage is used only
          for the site to function: remembering your theme/display preferences, each tool&apos;s
          own settings, and — if you&apos;re signed in — keeping you signed in between visits.
        </p>
      </LegalSection>

      <LegalSection title="Who else sees your data">
        <p>
          sheddex doesn&apos;t sell data, and doesn&apos;t share it for advertising. A small
          number of service providers handle the account/email infrastructure on sheddex&apos;s
          behalf, only for the specific purpose named:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <LegalLink href="https://www.convex.dev/legal/privacy">Convex</LegalLink> — stores
            account data (email, hashed password, session tokens), synced tool data, and (if you
            set one) your public profile — including uploaded profile pictures, via Convex&apos;s
            file storage — and runs the server-side code that handles all of it.
          </li>
          <li>
            <LegalLink href="https://resend.com/legal/privacy-policy">Resend</LegalLink> — sends
            the confirmation emails sheddex emails you (account creation, password changes,
            account deletion). Your email address is shared with Resend only to deliver these.
          </li>
          <li>
            <LegalLink href="https://policies.google.com/privacy">Google</LegalLink> — handles the
            &quot;Sign in with Google&quot; option, if you choose to use it, per Google&apos;s own
            privacy practices.
          </li>
          <li>
            <LegalLink href="https://vercel.com/legal/privacy-policy">Vercel</LegalLink> — hosts
            and serves the sheddex.com site itself, and so processes standard technical
            information (like IP addresses) as part of serving web pages, the same as any web
            host.
          </li>
          <li>
            <LegalLink href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement">
              GitHub Pages
            </LegalLink>{" "}
            — the Piano and Rhodes tones (used across several tools — see{" "}
            <LegalLink href="/credits">Credits</LegalLink>) are real recordings your browser
            fetches directly from two GitHub Pages-hosted sample libraries the first time you pick
            one of those tones, not through sheddex&apos;s own servers, so GitHub sees that
            request the same way it would for any page it hosts.
          </li>
        </ul>
        <p>
          These providers may process data on servers located outside your own country, including
          in the United States.
        </p>
      </LegalSection>

      <LegalSection title="How long data is kept">
        <p>
          Account data is kept for as long as your account exists. You can delete your account
          yourself, at any time, from the account page — this permanently removes your email,
          password, and sign-in history from sheddex&apos;s servers. Data stored in your own
          browser is kept until you clear it yourself and isn&apos;t affected by deleting your
          account.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Use sheddex without ever creating an account.</li>
          <li>
            View, change, or delete your account yourself, any time, from the account page —
            change or set a password, connect or disconnect Google sign-in, or permanently delete
            the account and everything tied to it.
          </li>
          <li>
            Turn a public profile back to private, or remove it entirely, any time from the Public
            Profile tab — either immediately stops anyone from being able to view it.
          </li>
          <li>
            Clear your browser&apos;s local storage for sheddex.com at any time to remove
            everything stored on your device.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Passwords are stored hashed, never in plain text. Traffic to sheddex.com is encrypted
          (HTTPS). No online service can guarantee perfect security, but sheddex doesn&apos;t
          collect more than it needs to in the first place, which limits what there is to protect.
        </p>
      </LegalSection>

      <LegalSection title="Children's privacy">
        <p>
          sheddex isn&apos;t directed at children under 13, and doesn&apos;t knowingly collect
          personal information from anyone under 13. If you believe a child has created an
          account, contact us using the method below and it will be removed.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If this policy changes, this page will be updated and the date at the top will change.
          There&apos;s no mailing list or other notification beyond that.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy, or requests about your data (including deleting it, beyond
          what the account page already lets you do yourself), can be sent via{" "}
          <LegalLink href="https://github.com/JackMechem/sheddex.com/issues">
            GitHub issues
          </LegalLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
