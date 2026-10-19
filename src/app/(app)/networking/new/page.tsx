import type { Metadata } from "next"

import { ContactForm, emptyContactForm } from "@/components/tracker/contact-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { listCompanyOptions } from "@/lib/records/data"
import { createContact } from "@/lib/records/tracker-actions"
import { listApplicationOptions } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Add contact" }

export default async function NewContactPage() {
  const [companies, applications] = await Promise.all([listCompanyOptions(), listApplicationOptions()])
  if (!companies.ok || !applications.ok) {
    const missing =
      (companies.ok === false && companies.error === "missing_table") ||
      (applications.ok === false && applications.error === "missing_table")
    return (
      <RecordState
        tone="error"
        title="Contact form could not be loaded"
        description={
          missing
            ? "Apply the networking, tasks, and preparation migration, then reload."
            : "Companies or applications could not be loaded."
        }
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Add contact" description="Link this person to a company or application you already track, or leave both blank." />
      <ContactForm
        action={createContact}
        values={emptyContactForm}
        companies={companies.data}
        applications={applications.data}
        submitLabel="Create contact"
        cancelHref="/networking"
      />
    </div>
  )
}
