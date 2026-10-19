import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { PreparationFilters, PreparationTable } from "@/components/tracker/lists"
import { Button } from "@/components/ui/button"
import { searchParamsToURL } from "@/lib/records/query"
import { filterPreparation, parsePreparationListQuery, preparationProgress, sortPreparation } from "@/lib/records/tracker"
import { listPreparation } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Preparation" }

export default async function PreparationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parsePreparationListQuery(searchParamsToURL(await searchParams))
  const result = await listPreparation()
  const progress = result.ok ? preparationProgress(result.data) : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Preparation"
        description="Certifications and interview practice you choose. This list is not a fixed catalog."
        action={<Button nativeButton={false} render={<Link href="/preparation/new" />}>Add item</Button>}
      />
      {result.ok && progress ? (
        result.data.length === 0 ? (
          <RecordState
            title="No preparation items yet"
            description="Add a certification, a coding topic, or a behavioral story you want to practice."
            action={<Button nativeButton={false} render={<Link href="/preparation/new" />}>Add item</Button>}
          />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total" value={progress.total} />
              <Stat label="Not started" value={progress.notStarted} />
              <Stat label="In progress" value={progress.inProgress} />
              <Stat label="Completed" value={progress.completed} />
            </dl>
            <PreparationFilters query={query} />
            {(() => {
              const visible = sortPreparation(filterPreparation(result.data, query), query)
              return visible.length === 0 ? (
                <RecordState
                  title="No matching items"
                  description="Try a different search or clear the filters."
                  action={<Button variant="outline" nativeButton={false} render={<Link href="/preparation" />}>Clear filters</Button>}
                />
              ) : (
                <PreparationTable items={visible} />
              )
            })()}
          </>
        )
      ) : (
        <RecordState
          tone="error"
          title="Preparation could not be loaded"
          description={
            result.ok === false && result.error === "missing_table"
              ? "Preparation items are not available yet. Apply the networking, tasks, and preparation migration, then reload."
              : "The preparation list could not be loaded. Refresh the page and try again."
          }
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  )
}
