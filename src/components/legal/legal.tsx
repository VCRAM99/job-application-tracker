import Link from "next/link"

import { Mark } from "@/components/brand/mark"

/**
 * Privacy notice and terms: plain-language templates written for the owner to review before a
 * public launch. They are not legal advice. LEGAL_UPDATED changes whenever either page does.
 */
export const LEGAL_UPDATED = "November 12, 2026"

/** Contact for privacy and deletion requests, set at build time; the pages say when it is missing. */
export function legalContact(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? ""
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null
}

export function ContactLine() {
  const contact = legalContact()
  return contact ? (
    <a href={`mailto:${contact}`} className="underline underline-offset-4">
      {contact}
    </a>
  ) : (
    <span>the site owner (a contact address has not been published yet)</span>
  )
}

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex gap-3 text-xs text-muted-foreground ${className}`}>
      <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
        Terms
      </Link>
    </nav>
  )
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background px-4 py-10">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm leading-6 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <Mark className="size-6" />
          Job Tracker
        </Link>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        </header>
        {children}
        <LegalLinks className="border-t pt-4" />
      </article>
    </div>
  )
}
