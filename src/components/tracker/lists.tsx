import Link from "next/link"

import { NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  OUTREACH_LABELS,
  OUTREACH_STATUSES,
  PREPARATION_CATEGORIES,
  PREPARATION_CATEGORY_LABELS,
  PREPARATION_STATUS_LABELS,
  PREPARATION_STATUSES,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TYPES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/records/constants"
import { setTaskCompletion } from "@/lib/records/tracker-actions"
import { isOverdue } from "@/lib/records/tracker"
import type {
  ContactListQuery,
  ContactRecord,
  PreparationListQuery,
  PreparationRecord,
  TaskListQuery,
  TaskRecord,
} from "@/lib/records/tracker"

export function ContactFilters({ query }: { query: ContactListQuery }) {
  return (
    <form method="get" action="/networking" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="contact-q" className="text-sm font-medium">Search</label>
        <Input id="contact-q" name="q" defaultValue={query.q} placeholder="Name, organization, email" />
      </div>
      <div className="space-y-2">
        <label htmlFor="contact-relationship" className="text-sm font-medium">Relationship</label>
        <NativeSelect id="contact-relationship" name="relationship" defaultValue={query.relationship}>
          <option value="all">All relationships</option>
          {RELATIONSHIP_TYPES.map((value) => (
            <option key={value} value={value}>{RELATIONSHIP_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="contact-outreach" className="text-sm font-medium">Outreach</label>
        <NativeSelect id="contact-outreach" name="outreach" defaultValue={query.outreach}>
          <option value="all">All outreach</option>
          {OUTREACH_STATUSES.map((value) => (
            <option key={value} value={value}>{OUTREACH_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="contact-follow" className="text-sm font-medium">Follow-up</label>
        <NativeSelect id="contact-follow" name="followUp" defaultValue={query.followUp}>
          <option value="all">Any date</option>
          <option value="upcoming">Upcoming</option>
          <option value="overdue">Overdue</option>
        </NativeSelect>
      </div>
      <div className="flex gap-2 lg:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/networking" />}>Clear</Button>
      </div>
    </form>
  )
}

export function ContactTable({ contacts, today }: { contacts: ContactRecord[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Contacts</caption>
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Relationship</th>
            <th className="px-3 py-2 font-medium">Outreach</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Follow-up</th>
            <th className="px-3 py-2 font-medium">Links</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <Link href={`/networking/${contact.id}`} className="font-medium underline-offset-4 hover:underline">{contact.name}</Link>
                <p className="text-muted-foreground">{[contact.roleTitle, contact.organization].filter(Boolean).join(" · ") || "—"}</p>
              </td>
              <td className="px-3 py-2">{RELATIONSHIP_LABELS[contact.relationshipType]}</td>
              <td className="px-3 py-2">{OUTREACH_LABELS[contact.outreachStatus]}</td>
              <td className="px-3 py-2">
                {contact.companyId ? (
                  <Link href={`/companies/${contact.companyId}`} className="underline-offset-4 hover:underline">{contact.companyName}</Link>
                ) : "—"}
              </td>
              <td className={`px-3 py-2 ${isOverdue(contact.nextFollowUpDate, today) ? "text-destructive" : ""}`}>
                {contact.nextFollowUpDate ?? "—"}
              </td>
              <td className="px-3 py-2">
                <span className="flex gap-3">
                  {contact.email ? <a href={`mailto:${contact.email}`}>Email</a> : null}
                  {contact.linkedinUrl ? <a href={contact.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a> : null}
                  {!contact.email && !contact.linkedinUrl ? "—" : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TaskFilters({ query }: { query: TaskListQuery }) {
  return (
    <form method="get" action="/tasks" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="task-q" className="text-sm font-medium">Search</label>
        <Input id="task-q" name="q" defaultValue={query.q} placeholder="Title or description" />
      </div>
      <div className="space-y-2">
        <label htmlFor="task-status" className="text-sm font-medium">Status</label>
        <NativeSelect id="task-status" name="status" defaultValue={query.status}>
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="task-priority" className="text-sm font-medium">Priority</label>
        <NativeSelect id="task-priority" name="priority" defaultValue={query.priority}>
          <option value="all">All priorities</option>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2 lg:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/tasks" />}>Clear</Button>
      </div>
    </form>
  )
}

export function TaskTable({ tasks, today }: { tasks: TaskRecord[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Tasks, sorted by due date</caption>
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Due</th>
            <th className="px-3 py-2 font-medium">Linked to</th>
            <th className="px-3 py-2 font-medium">Completion</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const overdue = task.status !== "done" && isOverdue(task.dueDate, today)
            return (
              <tr key={task.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/tasks/${task.id}`} className="font-medium underline-offset-4 hover:underline">{task.title}</Link>
                </td>
                <td className="px-3 py-2">{TASK_STATUS_LABELS[task.status]}</td>
                <td className="px-3 py-2">{TASK_PRIORITY_LABELS[task.priority]}</td>
                <td className={`px-3 py-2 ${overdue ? "text-destructive" : ""}`}>{task.dueDate ?? "—"}</td>
                <td className="px-3 py-2">
                  {task.applicationId ? (
                    <Link href={`/applications/${task.applicationId}`} className="underline-offset-4 hover:underline">{task.applicationTitle}</Link>
                  ) : task.companyId ? (
                    <Link href={`/companies/${task.companyId}`} className="underline-offset-4 hover:underline">{task.companyName}</Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <form action={setTaskCompletion}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="completed" value={task.status === "done" ? "false" : "true"} />
                    <Button type="submit" variant="outline" size="sm">
                      {task.status === "done" ? "Mark incomplete" : "Mark complete"}
                    </Button>
                  </form>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PreparationFilters({ query }: { query: PreparationListQuery }) {
  return (
    <form method="get" action="/preparation" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="prep-q" className="text-sm font-medium">Search</label>
        <Input id="prep-q" name="q" defaultValue={query.q} placeholder="Title or notes" />
      </div>
      <div className="space-y-2">
        <label htmlFor="prep-category" className="text-sm font-medium">Category</label>
        <NativeSelect id="prep-category" name="category" defaultValue={query.category}>
          <option value="all">All categories</option>
          {PREPARATION_CATEGORIES.map((value) => (
            <option key={value} value={value}>{PREPARATION_CATEGORY_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="prep-status" className="text-sm font-medium">Status</label>
        <NativeSelect id="prep-status" name="status" defaultValue={query.status}>
          <option value="all">All statuses</option>
          {PREPARATION_STATUSES.map((value) => (
            <option key={value} value={value}>{PREPARATION_STATUS_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2 lg:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/preparation" />}>Clear</Button>
      </div>
    </form>
  )
}

export function PreparationTable({ items }: { items: PreparationRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[680px] text-left text-sm">
        <caption className="sr-only">Preparation items</caption>
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Target</th>
            <th className="px-3 py-2 font-medium">Resource</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <Link href={`/preparation/${item.id}`} className="font-medium underline-offset-4 hover:underline">{item.title}</Link>
              </td>
              <td className="px-3 py-2">{PREPARATION_CATEGORY_LABELS[item.category]}</td>
              <td className="px-3 py-2">{PREPARATION_STATUS_LABELS[item.status]}</td>
              <td className="px-3 py-2">{item.targetDate ?? "—"}</td>
              <td className="px-3 py-2">
                {item.resourceUrl ? (
                  <a href={item.resourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">Open</a>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
