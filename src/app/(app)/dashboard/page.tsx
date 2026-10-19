import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { APPLICATION_STATUS_LABELS } from "@/lib/records/constants"
import { todayDate } from "@/lib/records/logic"
import { buildDashboard } from "@/lib/records/tracker"
import { loadDashboardSources } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const sources = await loadDashboardSources()
  const today = todayDate()
  const companiesReady = sources.companies.ok
  const applicationsReady = sources.applications.ok
  const metrics = buildDashboard({
    companies: sources.companies.ok ? sources.companies.data : [],
    applications: sources.applications.ok ? sources.applications.data : [],
    contacts: sources.contacts.ok ? sources.contacts.data : [],
    tasks: sources.tasks.ok ? sources.tasks.data : [],
    preparation: sources.preparation.ok ? sources.preparation.data : [],
    today,
  })
  const migrationNeeded =
    (!sources.contacts.ok && sources.contacts.error === "missing_table") ||
    (!sources.tasks.ok && sources.tasks.error === "missing_table") ||
    (!sources.preparation.ok && sources.preparation.error === "missing_table")

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Counts come from your records. Active applications are Applied, Recruiter Screen, Technical Interview, and Final Interview. Interviews are those three interview stages. Offers are separate. Submitted counts an applied date in the last 7 days, including today."
      />
      {migrationNeeded ? (
        <RecordState
          tone="error"
          title="Some sections are not available yet"
          description="Apply the networking, tasks, and preparation migration to include contacts, tasks, and preparation. Company and application counts below use the tables that are already available."
        />
      ) : null}
      {!companiesReady || !applicationsReady ? (
        <RecordState tone="error" title="Search totals could not be loaded" description="Refresh the page and try again." />
      ) : (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Companies" value={metrics.companyCount} />
          <Stat label="Applications" value={metrics.applicationCount} />
          <Stat label="Active applications" value={metrics.activeApplications} />
          <Stat label="Interviews" value={metrics.interviews} />
          <Stat label="Offers" value={metrics.offers} />
          <Stat label="Submitted, last 7 days" value={metrics.submittedLast7Days} />
        </dl>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Upcoming follow-ups">
          {sources.contacts.ok || sources.companies.ok ? (
            <ItemList
              items={metrics.upcomingFollowUps}
              empty="No upcoming follow-ups."
              render={(item) => (
                <Link href={item.href} className="underline-offset-4 hover:underline">{item.label}</Link>
              )}
              meta={(item) => `${item.detail} · ${item.date}`}
            />
          ) : null}
        </Section>
        <Section title="Overdue follow-ups">
          <ItemList
            items={metrics.overdueFollowUps}
            empty="No overdue follow-ups."
            render={(item) => <Link href={item.href} className="underline-offset-4 hover:underline">{item.label}</Link>}
            meta={(item) => `${item.detail} · ${item.date}`}
            warn
          />
        </Section>
        <Section title="Overdue tasks">
          {sources.tasks.ok ? (
            <ItemList
              items={metrics.overdueTasks}
              empty="No overdue tasks."
              render={(item) => <Link href={`/tasks/${item.id}`} className="underline-offset-4 hover:underline">{item.title}</Link>}
              meta={(item) => item.dueDate}
              warn
            />
          ) : (
            <p className="text-sm text-muted-foreground">Tasks could not be loaded.</p>
          )}
        </Section>
        <Section title="Recent applications">
          {applicationsReady ? (
            <ItemList
              items={metrics.recentApplications}
              empty="No applications yet."
              render={(item) => <Link href={`/applications/${item.id}`} className="underline-offset-4 hover:underline">{item.jobTitle}</Link>}
              meta={(item) => `${item.companyName} · ${APPLICATION_STATUS_LABELS[item.status]}`}
            />
          ) : null}
        </Section>
        <Section title="Priority companies needing attention">
          {companiesReady ? (
            <ItemList
              items={metrics.priorityCompanies}
              empty="No priority companies need attention."
              render={(item) => <Link href={`/companies/${item.id}`} className="underline-offset-4 hover:underline">{item.name}</Link>}
              meta={(item) => `Priority ${item.priorityTier}${item.followUpDate ? ` · follow-up ${item.followUpDate}` : " · no follow-up date"}`}
            />
          ) : null}
        </Section>
        <Section title="Preparation progress">
          {sources.preparation.ok ? (
            metrics.preparation.total === 0 ? (
              <p className="text-sm text-muted-foreground">No preparation items yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Not started</dt><dd>{metrics.preparation.notStarted}</dd></div>
                <div><dt className="text-muted-foreground">In progress</dt><dd>{metrics.preparation.inProgress}</dd></div>
                <div><dt className="text-muted-foreground">Completed</dt><dd>{metrics.preparation.completed}</dd></div>
                <div><dt className="text-muted-foreground">Total</dt><dd>{metrics.preparation.total}</dd></div>
              </dl>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Preparation could not be loaded.</p>
          )}
        </Section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ItemList<T>({
  items,
  empty,
  render,
  meta,
  warn = false,
}: {
  items: T[]
  empty: string
  render: (item: T) => React.ReactNode
  meta: (item: T) => string
  warn?: boolean
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, index) => (
        <li key={index} className="flex flex-col">
          {render(item)}
          <span className={warn ? "text-destructive" : "text-muted-foreground"}>{meta(item)}</span>
        </li>
      ))}
    </ul>
  )
}
