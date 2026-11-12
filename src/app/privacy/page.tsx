import type { Metadata } from "next"

import { ContactLine, LegalPage } from "@/components/legal/legal"

export const metadata: Metadata = { title: "Privacy", description: "What Job Tracker stores, who it is shared with, and how to export or delete it." }

// Template for the owner to review; not legal advice.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>Job Tracker is a personal tool for organizing a job search. This page explains what it stores, who it is shared with, and how to get it back or delete it.</p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> email address and sign-in details. Passwords are handled by our authentication provider and are never visible to us.</li>
        <li><strong>What you enter:</strong> applications, companies, contacts, tasks, preparation notes, daily tasks, and optional health entries.</li>
        <li><strong>Resumes:</strong> files you upload, the text read from them, and the versions you create.</li>
        <li><strong>Career facts:</strong> the profile, sources, and facts you add or accept, and AI suggestions until you accept or dismiss them.</li>
        <li><strong>AI results:</strong> fit analyses, interview questions, research briefs, and drafts, with which provider and model produced them.</li>
        <li><strong>Provider keys:</strong> an AI key you save is encrypted before it is stored. It is decrypted only on our server to make a request you started, and it is never shown again or written to logs.</li>
        <li><strong>Usage records:</strong> when you used an AI feature and how many tokens it used, to enforce limits.</li>
        <li><strong>Job preferences:</strong> saved searches, saved and hidden jobs, and alert settings.</li>
      </ul>
      <p>Your records are private to your account. The database only returns rows that belong to the signed-in user.</p>

      <h2>Who it is shared with</h2>
      <ul>
        <li><strong>Your AI provider.</strong> When you run an AI feature, the text it needs (for example a job description and your verified facts) is sent with your own key to the provider you chose, such as Google Gemini, and to no one else. Their terms apply to that request. On some free tiers a provider may use requests to improve its products, so the app warns you to use a paid key for sensitive text.</li>
        <li><strong>Service providers that run the app:</strong> hosting (Vercel), database, sign-in, and file storage (Supabase), and, when enabled, bot protection on sign-in forms (Cloudflare Turnstile) and error reports (Sentry). Error reports are stripped of your content, email, and keys before they are sent.</li>
      </ul>
      <p>We do not sell your data, show ads, or use your data to train AI models. Nothing is ever sent to an employer or contact for you; drafts are only copied or opened in your own email app.</p>

      <h2>Cookies</h2>
      <p>The app uses cookies only to keep you signed in. There are no advertising or analytics cookies.</p>

      <h2>Export your data</h2>
      <p>Settings → Your data → <strong>Download my data (JSON)</strong> gives you one file with every record your account owns. It includes the text and parsed sections of each resume you uploaded and lists the files by name. Applications and companies can also be exported as CSV, and tailored resume versions as PDF or DOCX. To get an original uploaded file back, email <ContactLine />.</p>

      <h2 id="delete">Delete your data</h2>
      <p>You can delete individual records, resumes, analyses, drafts, and saved keys in the app at any time.</p>
      <p>To delete your whole account, email <ContactLine /> from the address you signed up with. Your account, every record it owns, and your uploaded files will be deleted. Copies in routine backups expire on their own schedule.</p>

      <h2>Changes and contact</h2>
      <p>If this page changes, the date at the top changes too. Questions: <ContactLine />.</p>
    </LegalPage>
  )
}
