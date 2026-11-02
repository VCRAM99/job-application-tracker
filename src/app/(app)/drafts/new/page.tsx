import type { Metadata } from "next"
import { connection } from "next/server"

import { DraftForm } from "@/components/coach/draft-forms"
import { CoachOff } from "@/components/coach/view"
import { PageHeader, RecordState } from "@/components/records/fields"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { listApplications } from "@/lib/records/data"
import { isUuid } from "@/lib/records/form-state"
import { getContact } from "@/lib/records/tracker-data"
import { loadExecutionMode } from "@/lib/resume/data"

export const metadata: Metadata = { title: "New draft" }
export const instant = false

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const query = await searchParams
  const contactId = typeof query.contact === "string" && isUuid(query.contact) ? query.contact : null
  const applicationId = typeof query.application === "string" && isUuid(query.application) ? query.application : null
  const kind = typeof query.kind === "string" ? query.kind : "outreach_recruiter"
  const [contact, applications, mode] = await Promise.all([
    contactId ? getContact(contactId) : Promise.resolve(null),
    listApplications(),
    loadExecutionMode(),
  ])
  if (contactId && (!contact || !contact.ok || !contact.data)) {
    return <RecordState title="Contact not found" description="Open a contact from Networking and try again." />
  }
  const person = contact && contact.ok ? contact.data : null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="New draft"
        subtitle={person ? `For ${person.name}${person.organization ? ` · ${person.organization}` : ""}` : "You review and send it yourself."}
      />
      <DraftForm
        contactId={person?.id ?? null}
        applicationId={applicationId ?? person?.applicationId ?? null}
        initialKind={kind}
        mode={mode.mode}
        nonce={crypto.randomUUID()}
        applications={applications.ok ? applications.data.map((item) => ({ id: item.id, label: `${item.jobTitle} · ${item.companyName}` })) : []}
        hasEmail={Boolean(person?.email)}
      />
    </div>
  )
}
