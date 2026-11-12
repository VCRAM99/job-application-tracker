import type { Metadata } from "next"

import { ContactLine, LegalPage } from "@/components/legal/legal"

export const metadata: Metadata = { title: "Terms", description: "The terms for using Job Tracker." }

// Template for the owner to review; not legal advice.
export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>By creating an account or using Job Tracker, you agree to these terms.</p>

      <h2>The service</h2>
      <p>Job Tracker is a personal tool for organizing a job search. It is provided as is, without warranties, and features may change or stop. Keep your own copies of anything important; Settings → Your data lets you download everything.</p>

      <h2>Your account</h2>
      <ul>
        <li>Use a real email address and keep your password to yourself.</li>
        <li>You are responsible for what you store and for how you use the app.</li>
        <li>Only add information about other people (for example contacts) that you are allowed to keep.</li>
      </ul>

      <h2>AI features</h2>
      <ul>
        <li>AI output is a suggestion, labeled as unverified. Fit estimates, resume edits, research, and drafts can be wrong or incomplete; check them before you rely on them or send anything.</li>
        <li>The app never sends messages or applications for you.</li>
        <li>With your own AI key, the provider bills you for your requests, and its terms apply to them.</li>
        <li>Requests are rate limited to keep the service fair and to protect your key.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use the app to break the law, to harass anyone, to store other people&apos;s data without the right to, or to attack, overload, or scrape the service. Accounts that do may be suspended or removed.</p>

      <h2>Ending your use</h2>
      <p>You can stop using the app at any time and ask for your account to be deleted (see Privacy). We may suspend accounts that break these terms.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, Job Tracker and its developer are not liable for indirect or consequential losses, including lost opportunities, arising from use of the app or its AI suggestions.</p>

      <h2>Changes and contact</h2>
      <p>If these terms change, the date at the top changes too. Questions: <ContactLine />.</p>
    </LegalPage>
  )
}
