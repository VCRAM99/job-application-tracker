import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { CompanyFilters, CompanyTable } from "@/components/records/tables"
import { Button } from "@/components/ui/button"
import { listCompanies } from "@/lib/records/data"
import {
  filterCompanies,
  parseCompanyListQuery,
  searchParamsToURL,
  sortCompanies,
} from "@/lib/records/query"

export const metadata: Metadata = { title: "Companies" }

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseCompanyListQuery(searchParamsToURL(await searchParams))
  const result = await listCompanies()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Companies"
        description="Research targets, priority, and the applications tied to each company."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/companies/import" />}>Import / export</Button>
            <Button nativeButton={false} render={<Link href="/companies/new" />}>Add company</Button>
          </div>
        }
      />
      {result.ok ? (
        <>
          <CompanyFilters query={query} />
          {result.data.length === 0 ? (
            <RecordState
              title="No companies yet"
              description="Add a company to track its size, research status, priority, and follow-up date."
              action={<Button nativeButton={false} render={<Link href="/companies/new" />}>Add company</Button>}
            />
          ) : (
            (() => {
              const visible = sortCompanies(filterCompanies(result.data, query), query)
              return visible.length === 0 ? (
                <RecordState
                  title="No matching companies"
                  description="Try a different search or clear the filters."
                  action={<Button variant="outline" nativeButton={false} render={<Link href="/companies" />}>Clear filters</Button>}
                />
              ) : (
                <CompanyTable companies={visible} query={query} today={today()} />
              )
            })()
          )}
        </>
      ) : (
        <RecordState
          tone="error"
          title="Companies could not be loaded"
          description={
            result.error === "missing_table"
              ? "These tables are not available yet. Apply the companies and applications migration, then reload."
              : "The company list could not be loaded. Refresh the page and try again."
          }
        />
      )}
    </div>
  )
}
