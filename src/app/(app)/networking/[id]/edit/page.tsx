import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader, RecordState } from "@/components/records/fields"
import { ContactForm } from "@/components/tracker/contact-form"
import { listCompanyOptions } from "@/lib/records/data"
import { updateContact } from "@/lib/records/tracker-actions"
import { getContact, listApplicationOptions } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Edit contact" }

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [contact, companies, applications] = await Promise.all([
    getContact(id),
    listCompanyOptions(),
    listApplicationOptions(),
  ])
  if (!contact.ok || !companies.ok || !applications.ok) {
    return (
      <RecordState
        tone="error"
        title="Contact could not be loaded"
        description="This contact could not be loaded. Refresh the page and try again."
      />
    )
  }
  if (!contact.data) notFound()
  const record = contact.data

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${record.name}`} description="Update outreach, follow-up, and the company or application link." />
      <ContactForm
        action={updateContact}
        id={record.id}
        companies={companies.data}
        applications={applications.data}
        submitLabel="Save contact"
        cancelHref={`/networking/${record.id}`}
        values={{
          name: record.name,
          roleTitle: record.roleTitle ?? "",
          organization: record.organization ?? "",
          email: record.email ?? "",
          linkedinUrl: record.linkedinUrl ?? "",
          companyId: record.companyId ?? "",
          applicationId: record.applicationId ?? "",
          relationshipType: record.relationshipType,
          outreachStatus: record.outreachStatus,
          lastContactedAt: record.lastContactedAt ?? "",
          nextFollowUpDate: record.nextFollowUpDate ?? "",
          notes: record.notes ?? "",
        }}
      />
    </div>
  )
}
