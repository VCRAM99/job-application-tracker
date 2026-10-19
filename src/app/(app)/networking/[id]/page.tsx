import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { DetailList, PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { OUTREACH_LABELS, RELATIONSHIP_LABELS } from "@/lib/records/constants"
import { deleteContact } from "@/lib/records/tracker-actions"
import { getContact } from "@/lib/records/tracker-data"
import { isOverdue } from "@/lib/records/tracker"
import { todayDate } from "@/lib/records/logic"

export const metadata: Metadata = { title: "Contact" }

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getContact(id)
  if (!result.ok) {
    return (
      <RecordState
        tone="error"
        title="Contact could not be loaded"
        description={
          result.error === "missing_table"
            ? "Apply the networking, tasks, and preparation migration, then reload."
            : "This contact could not be loaded. Refresh the page and try again."
        }
      />
    )
  }
  if (!result.data) notFound()
  const contact = result.data
  const today = todayDate()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title={contact.name}
        description={[contact.roleTitle, contact.organization].filter(Boolean).join(" · ") || "Contact"}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/networking/${contact.id}/edit`} />}>Edit</Button>
            <DeleteRecordButton
              action={deleteContact}
              id={contact.id}
              label="Delete contact"
              title={`Delete ${contact.name}?`}
              description="This removes the contact. Linked companies and applications stay."
            />
          </div>
        }
      />
      <DetailList
        items={[
          { label: "Relationship", value: RELATIONSHIP_LABELS[contact.relationshipType] },
          { label: "Outreach", value: OUTREACH_LABELS[contact.outreachStatus] },
          {
            label: "Email",
            value: contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "—",
          },
          {
            label: "LinkedIn",
            value: contact.linkedinUrl ? (
              <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{contact.linkedinUrl}</a>
            ) : "—",
          },
          {
            label: "Company",
            value: contact.companyId ? (
              <Link href={`/companies/${contact.companyId}`} className="underline-offset-4 hover:underline">{contact.companyName}</Link>
            ) : "—",
          },
          {
            label: "Application",
            value: contact.applicationId ? (
              <Link href={`/applications/${contact.applicationId}`} className="underline-offset-4 hover:underline">{contact.applicationTitle}</Link>
            ) : "—",
          },
          { label: "Last contacted", value: contact.lastContactedAt ?? "—" },
          {
            label: "Follow-up",
            value: (
              <span className={isOverdue(contact.nextFollowUpDate, today) ? "text-destructive" : undefined}>
                {contact.nextFollowUpDate ?? "—"}
              </span>
            ),
          },
        ]}
      />
      {contact.notes ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{contact.notes}</p>
        </section>
      ) : null}
    </div>
  )
}
