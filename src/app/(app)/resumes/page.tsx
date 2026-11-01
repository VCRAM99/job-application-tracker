import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { ResumeStudioOff } from "@/components/resume/off"
import { PageHeader, RecordState } from "@/components/records/fields"
import { ResumeUpload } from "@/components/resume/upload"
import { Button } from "@/components/ui/button"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { requireUser } from "@/lib/auth/session"
import { isUuid } from "@/lib/records/form-state"
import { listResumes } from "@/lib/resume/data"
import { resumeStudioEnabled } from "@/lib/resume/flags"

export const metadata: Metadata = { title: "Resumes" }
export const instant = false

const STATUS: Record<string, string> = { unparsed: "Not parsed", parsed: "Parsed", failed: "Parse failed" }

export default async function ResumesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!resumeStudioEnabled()) return <ResumeStudioOff />
  await connection()
  const [user, resumes, query] = await Promise.all([requireUser(), listResumes(), searchParams])
  if (!resumes) {
    return <RecordState tone="error" title="Resumes could not be loaded" description="Apply the resume studio migration, then reload." />
  }
  const analysis = typeof query.analysis === "string" && isUuid(query.analysis) ? query.analysis : null
  const application = typeof query.application === "string" && isUuid(query.application) ? query.application : null
  const tailorQuery = analysis && jobAnalysisEnabled() ? `?analysis=${analysis}${application ? `&application=${application}` : ""}` : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Resumes"
        description={tailorQuery ? "Choose a parsed resume to tailor." : "Upload a resume, parse it, and tailor it to a fit analysis."}
        action={<ResumeUpload userId={user.id} />}
      />
      {resumes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No resumes yet.</p>
      ) : (
        <ul className="grid gap-2">
          {resumes.map((resume) => (
            <li key={resume.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/resumes/${resume.id}`} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
                {resume.label}
              </Link>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="uppercase">{resume.kind}</span>
                <span>{STATUS[resume.parseStatus]}</span>
                {tailorQuery && resume.parseStatus === "parsed" ? (
                  <Button size="sm" nativeButton={false} render={<Link href={`/resumes/${resume.id}/tailor${tailorQuery}`} />}>
                    Tailor
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
