import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { ResearchForm } from "@/components/coach/draft-forms"
import { CoachOff } from "@/components/coach/view"
import { PageHeader } from "@/components/records/fields"
import { getApplication } from "@/lib/records/data"
import { isUuid } from "@/lib/records/form-state"
import { loadExecutionMode } from "@/lib/resume/data"
import { coachAllowed } from "@/lib/beta"

export const metadata: Metadata = { title: "Company research" }
export const instant = false

export default async function NewResearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await coachAllowed())) return <CoachOff />
  await connection()
  const query = await searchParams
  const applicationId = typeof query.application === "string" && isUuid(query.application) ? query.application : null
  if (!applicationId) notFound()
  const [application, mode] = await Promise.all([getApplication(applicationId), loadExecutionMode()])
  if (!application.ok || !application.data) notFound()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Company research" subtitle={`${application.data.companyName} · ${application.data.jobTitle} · From your sources only: paste the text, nothing is fetched`} />
      <ResearchForm applicationId={applicationId} mode={mode.mode} nonce={crypto.randomUUID()} />
    </div>
  )
}
