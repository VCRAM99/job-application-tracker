import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { ApplicationFilters, ApplicationTable } from "@/components/records/tables"
import { Button } from "@/components/ui/button"
import { listApplications, listCompanyOptions } from "@/lib/records/data"
import {
  filterApplications,
  parseApplicationListQuery,
  searchParamsToURL,
  sortApplications,
} from "@/lib/records/query"

export const metadata: Metadata = { title: "Applications" }

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseApplicationListQuery(searchParamsToURL(await searchParams))
  const [result, companies] = await Promise.all([listApplications(), listCompanyOptions()])

  const sources = result.ok
    ? [...new Set(result.data.map((application) => application.source).filter((source): source is string => Boolean(source)))].sort()
    : []

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Track each role from Saved through Offer, including the company it belongs to."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/applications/import" />}>Import / export</Button>
            <Button nativeButton={false} render={<Link href="/applications/new" />}>Add application</Button>
          </div>
        }
      />
      {result.ok && companies.ok ? (
        <>
          <ApplicationFilters
            query={query}
            companies={companies.data}
            sources={sources}
          />
          {result.data.length === 0 ? (
            <RecordState
              title="No applications yet"
              description="Add an application for a company you already track, or create the company as you go."
              action={<Button nativeButton={false} render={<Link href="/applications/new" />}>Add application</Button>}
            />
          ) : (
            (() => {
              const visible = sortApplications(filterApplications(result.data, query), query)
              return visible.length === 0 ? (
                <RecordState
                  title="No matching applications"
                  description="Try a different search or clear the filters."
                  action={<Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>Clear filters</Button>}
                />
              ) : (
                <ApplicationTable applications={visible} query={query} today={today()} />
              )
            })()
          )}
        </>
      ) : (
        <RecordState
          tone="error"
          title="Applications could not be loaded"
          description={
            result.ok === false && result.error === "missing_table"
              ? "These tables are not available yet. Apply the companies and applications migration, then reload."
              : "The application list could not be loaded. Refresh the page and try again."
          }
        />
      )}
    </div>
  )
}
