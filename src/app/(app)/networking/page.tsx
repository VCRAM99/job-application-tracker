import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { ContactFilters, ContactTable } from "@/components/tracker/lists"
import { Button } from "@/components/ui/button"
import { listContacts } from "@/lib/records/tracker-data"
import { todayDate } from "@/lib/records/logic"
import { isOverdue, isUpcoming } from "@/lib/records/tracker"
import { filterContacts, parseContactListQuery, sortContacts } from "@/lib/records/tracker"
import { searchParamsToURL } from "@/lib/records/query"

export const metadata: Metadata = { title: "Networking" }

const missing =
  "Contacts are not available yet. Apply the networking, tasks, and preparation migration, then reload."

export default async function NetworkingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseContactListQuery(searchParamsToURL(await searchParams))
  const result = await listContacts()
  const today = todayDate()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Networking"
        description="Contacts and follow-ups. Nothing here sends email or LinkedIn messages."
        action={<Button nativeButton={false} render={<Link href="/networking/new" />}>Add contact</Button>}
      />
      {result.ok ? (
        result.data.length === 0 ? (
          <RecordState
            title="No contacts yet"
            description="Add a recruiter, hiring manager, or referral and optionally link them to a company or application."
            action={<Button nativeButton={false} render={<Link href="/networking/new" />}>Add contact</Button>}
          />
        ) : (
          <>
            <FollowUps contacts={result.data} today={today} />
            <ContactFilters query={query} />
            {(() => {
              const visible = sortContacts(filterContacts(result.data, query, today), query)
              return visible.length === 0 ? (
                <RecordState
                  title="No matching contacts"
                  description="Try a different search or clear the filters."
                  action={<Button variant="outline" nativeButton={false} render={<Link href="/networking" />}>Clear filters</Button>}
                />
              ) : (
                <ContactTable contacts={visible} today={today} />
              )
            })()}
          </>
        )
      ) : (
        <RecordState
          tone="error"
          title="Contacts could not be loaded"
          description={result.error === "missing_table" ? missing : "The contact list could not be loaded. Refresh the page and try again."}
        />
      )}
    </div>
  )
}

function FollowUps({
  contacts,
  today,
}: {
  contacts: Array<{ id: string; name: string; nextFollowUpDate: string | null }>
  today: string
}) {
  const overdue = contacts.filter((contact) => isOverdue(contact.nextFollowUpDate, today))
  const upcoming = contacts
    .filter((contact) => isUpcoming(contact.nextFollowUpDate, today))
    .sort((left, right) => (left.nextFollowUpDate ?? "").localeCompare(right.nextFollowUpDate ?? ""))
    .slice(0, 5)
  if (overdue.length === 0 && upcoming.length === 0) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-medium">Overdue follow-ups</h2>
        {overdue.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None overdue.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.map((contact) => (
              <li key={contact.id}>
                <Link href={`/networking/${contact.id}`} className="underline-offset-4 hover:underline">{contact.name}</Link>
                <span className="text-destructive"> · {contact.nextFollowUpDate}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-medium">Upcoming follow-ups</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None scheduled.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((contact) => (
              <li key={contact.id}>
                <Link href={`/networking/${contact.id}`} className="underline-offset-4 hover:underline">{contact.name}</Link>
                <span className="text-muted-foreground"> · {contact.nextFollowUpDate}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
