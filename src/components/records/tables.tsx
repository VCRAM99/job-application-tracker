import Link from "next/link"

import { NativeSelect, PriorityPill, StatusPill } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  COMPANY_SIZE_LABELS,
  COMPANY_SIZES,
  PRIORITY_LABELS,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
} from "@/lib/records/constants"
import {
  applicationQueryRecord,
  companyQueryRecord,
  isFollowUpDue,
  listHref,
  type ApplicationListQuery,
  type ApplicationRecord,
  type CompanyListQuery,
  type CompanyRecord,
} from "@/lib/records/query"

function SortLink({
  href,
  label,
  active,
  dir,
}: {
  href: string
  label: string
  active: boolean
  dir: "asc" | "desc"
}) {
  return (
    <Link href={href} className="underline-offset-4 hover:underline" aria-current={active ? "true" : undefined}>
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  )
}

function dueClass(date: string | null, today: string) {
  return isFollowUpDue(date, today) ? "text-destructive" : undefined
}

export function CompanyFilters({ query }: { query: CompanyListQuery }) {
  return (
    <form method="get" action="/companies" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="company-q" className="text-sm font-medium">
          Search
        </label>
        <Input id="company-q" name="q" defaultValue={query.q} placeholder="Name, industry, location" />
      </div>
      <div className="space-y-2">
        <label htmlFor="company-size" className="text-sm font-medium">
          Size
        </label>
        <NativeSelect id="company-size" name="size" defaultValue={query.size}>
          <option value="all">All sizes</option>
          {COMPANY_SIZES.map((size) => (
            <option key={size} value={size}>
              {COMPANY_SIZE_LABELS[size]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="company-research" className="text-sm font-medium">
          Research
        </label>
        <NativeSelect id="company-research" name="researchStatus" defaultValue={query.researchStatus}>
          <option value="all">All statuses</option>
          {RESEARCH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RESEARCH_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="company-priority" className="text-sm font-medium">
          Priority
        </label>
        <NativeSelect id="company-priority" name="priority" defaultValue={query.priority}>
          <option value="all">All priorities</option>
          {PRIORITY_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {PRIORITY_LABELS[tier]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <input type="hidden" name="sort" value={query.sort === "name" ? "" : query.sort} />
      <input type="hidden" name="dir" value={query.dir === "asc" ? "" : query.dir} />
      <div className="flex gap-2 lg:col-span-5">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/companies" />}>
          Clear
        </Button>
      </div>
    </form>
  )
}

export function CompanyTable({
  companies,
  query,
  today,
}: {
  companies: CompanyRecord[]
  query: CompanyListQuery
  today: string
}) {
  const current = companyQueryRecord(query)
  const href = (sort: CompanyListQuery["sort"]) =>
    listHref("/companies", current, {
      sort: sort === "name" ? "" : sort,
      dir: query.sort === sort && query.dir === "asc" ? "desc" : query.sort === sort ? "" : sort === "name" ? "" : "desc",
    })

  return (
    <div className="surface overflow-x-auto">
      <table className="data-table w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Companies</caption>
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "name" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("name")} label="Name" active={query.sort === "name"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "priority" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("priority")} label="Priority" active={query.sort === "priority"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Research</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "applications" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("applications")} label="Applications" active={query.sort === "applications"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "followUp" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("followUp")} label="Follow-up" active={query.sort === "followUp"} dir={query.dir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <Link href={`/companies/${company.id}`} className="font-medium underline-offset-4 hover:underline">
                  {company.name}
                </Link>
              </td>
              <td className="px-3 py-2">
                <PriorityPill tier={company.priorityTier} label={PRIORITY_LABELS[company.priorityTier]} />
              </td>
              <td className="px-3 py-2">{COMPANY_SIZE_LABELS[company.size]}</td>
              <td className="px-3 py-2">{RESEARCH_STATUS_LABELS[company.researchStatus]}</td>
              <td className="px-3 py-2">{company.location ?? "—"}</td>
              <td className="px-3 py-2">{company.applicationCount}</td>
              <td className={`px-3 py-2 ${dueClass(company.followUpDate, today) ?? ""}`}>
                {company.followUpDate ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ApplicationFilters({
  query,
  companies,
  sources,
}: {
  query: ApplicationListQuery
  companies: Array<{ id: string; name: string }>
  sources: string[]
}) {
  return (
    <form method="get" action="/applications" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor="application-q" className="text-sm font-medium">
          Search
        </label>
        <Input id="application-q" name="q" defaultValue={query.q} placeholder="Title, company, notes" />
      </div>
      <div className="space-y-2">
        <label htmlFor="application-status" className="text-sm font-medium">
          Status
        </label>
        <NativeSelect id="application-status" name="status" defaultValue={query.status}>
          <option value="all">All statuses</option>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="application-company" className="text-sm font-medium">
          Company
        </label>
        <NativeSelect id="application-company" name="companyId" defaultValue={query.companyId}>
          <option value="all">All companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <label htmlFor="application-source" className="text-sm font-medium">
          Source
        </label>
        <NativeSelect id="application-source" name="source" defaultValue={query.source}>
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </NativeSelect>
      </div>
      <input type="hidden" name="sort" value={query.sort === "updated" ? "" : query.sort} />
      <input type="hidden" name="dir" value={query.dir === "desc" ? "" : query.dir} />
      <div className="flex gap-2 lg:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>
          Clear
        </Button>
      </div>
    </form>
  )
}

export function ApplicationTable({
  applications,
  query,
  today,
}: {
  applications: ApplicationRecord[]
  query: ApplicationListQuery
  today: string
}) {
  const current = applicationQueryRecord(query)
  const href = (sort: ApplicationListQuery["sort"]) =>
    listHref("/applications", current, {
      sort: sort === "updated" ? "" : sort,
      dir:
        query.sort === sort && query.dir === "desc"
          ? "asc"
          : query.sort === sort
            ? ""
            : sort === "updated"
              ? ""
              : "asc",
    })

  return (
    <div className="surface overflow-x-auto">
      <table className="data-table w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">Applications</caption>
        <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "title" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("title")} label="Title" active={query.sort === "title"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "company" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("company")} label="Company" active={query.sort === "company"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "status" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("status")} label="Status" active={query.sort === "status"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "applied" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("applied")} label="Applied" active={query.sort === "applied"} dir={query.dir} />
            </th>
            <th className="px-3 py-2 font-medium" aria-sort={query.sort === "followUp" ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
              <SortLink href={href("followUp")} label="Follow-up" active={query.sort === "followUp"} dir={query.dir} />
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <Link href={`/applications/${application.id}`} className="font-medium underline-offset-4 hover:underline">
                  {application.jobTitle}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Link href={`/companies/${application.companyId}`} className="underline-offset-4 hover:underline">
                  {application.companyName}
                </Link>
              </td>
              <td className="px-3 py-2">
                <StatusPill status={application.status} label={APPLICATION_STATUS_LABELS[application.status]} />
              </td>
              <td className="px-3 py-2">{application.source ?? "—"}</td>
              <td className="px-3 py-2">{application.appliedAt ?? "—"}</td>
              <td className={`px-3 py-2 ${dueClass(application.nextFollowUpDate, today) ?? ""}`}>
                {application.nextFollowUpDate ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
