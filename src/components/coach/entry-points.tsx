import Link from "next/link"

import { AnswerForm } from "@/components/coach/draft-forms"
import { DraftList, FollowUpList, Section } from "@/components/coach/view"
import { Button } from "@/components/ui/button"
import { latestCoachAnalysisId, listBriefs, listDrafts, listQuestionSets } from "@/lib/coach/data"
import { loadFollowUps } from "@/lib/coach/follow-up-data"
import { loadExecutionMode } from "@/lib/resume/data"

/** Interview prep, research, drafts, answers, and follow-ups for one application. The caller checks the flag. */
export async function ApplicationCoach({ applicationId }: { applicationId: string }) {
  const [analysisId, sets, briefs, drafts, answers, followUps, mode] = await Promise.all([
    latestCoachAnalysisId(applicationId),
    listQuestionSets({ applicationId }),
    listBriefs({ applicationId }),
    listDrafts({ applicationId, excludeKind: "application_answer" }),
    listDrafts({ applicationId, kind: "application_answer" }),
    loadFollowUps({ applicationId }),
    loadExecutionMode(),
  ])
  const prepHref = sets[0] ? `/interview/${sets[0].id}` : analysisId ? `/interview/new?analysis=${analysisId}` : null

  return (
    <div className="flex flex-col gap-6 border-t pt-6">
      <div className="flex flex-wrap items-center gap-2">
        {prepHref ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={prepHref} />}>Prep</Button>
        ) : (
          <span className="text-xs text-muted-foreground">Run a fit analysis to unlock interview prep.</span>
        )}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/research/new?application=${applicationId}`} />}>Research</Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/drafts/new?application=${applicationId}`} />}>Draft</Button>
      </div>
      {followUps.ok && followUps.suggestions.length > 0 ? (
        <Section id="app-follow-ups" title="Follow-ups" help="From fixed timing rules, not AI. Create task adds one task; a second click finds the same task.">
          <FollowUpList suggestions={followUps.suggestions} />
        </Section>
      ) : null}
      {sets.length > 0 || briefs.length > 0 ? (
        <Section id="app-prep" title="Prep and research">
          <ul className="grid gap-2 text-sm">
            {sets.map((set) => (
              <li key={set.id} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2">
                <Link href={`/interview/${set.id}`} className="underline-offset-4 hover:underline">Interview questions</Link>
                <span className="text-xs text-muted-foreground">{set.questions.length} · {new Date(set.createdAt).toLocaleDateString("en-US")}</span>
              </li>
            ))}
            {briefs.map((brief) => (
              <li key={brief.id} className="flex flex-wrap justify-between gap-2 rounded-lg border px-3 py-2">
                <Link href={`/research/${brief.id}`} className="underline-offset-4 hover:underline">{brief.label}</Link>
                <span className="text-xs text-muted-foreground">{brief.claims.length} claims</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {drafts.length > 0 ? (
        <Section id="app-drafts" title="Drafts">
          <DraftList drafts={drafts} empty="No drafts yet." />
        </Section>
      ) : null}
      <Section id="answers" title="Application answers" help="Paste a question from the application form. Answers are saved here so you can copy them again.">
        <DraftList drafts={answers} empty="No answers yet." />
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">New answer</summary>
          <div className="mt-3">
            <AnswerForm applicationId={applicationId} mode={mode.mode} nonce={crypto.randomUUID()} />
          </div>
        </details>
      </Section>
    </div>
  )
}

/** Drafts and follow-ups for one contact. The caller checks the flag. */
export async function ContactCoach({ contactId }: { contactId: string }) {
  const [drafts, followUps] = await Promise.all([listDrafts({ contactId }), loadFollowUps({ contactId })])
  return (
    <div className="flex flex-col gap-6 border-t pt-6">
      {followUps.ok && followUps.suggestions.length > 0 ? (
        <Section id="contact-follow-ups" title="Follow-ups">
          <FollowUpList suggestions={followUps.suggestions} />
        </Section>
      ) : null}
      <Section id="contact-drafts" title="Drafts" help="AI drafts you review and send yourself. Mark as sent updates this contact only when you click it.">
        <DraftList drafts={drafts} empty="No drafts yet." />
      </Section>
    </div>
  )
}

/** `followUps` lets the page start the query before its own data, so they load together. */
export async function DashboardFollowUps({ followUps: started }: { followUps?: ReturnType<typeof loadFollowUps> } = {}) {
  const followUps = await (started ?? loadFollowUps())
  if (!followUps.ok) return null
  return (
    <Section id="dashboard-follow-ups" title="Suggested follow-ups" help="From fixed timing rules: a week in Applied with no change, a thank-you within a day of an interview stage, and contact follow-up dates.">
      <FollowUpList suggestions={followUps.suggestions.slice(0, 8)} />
    </Section>
  )
}

export async function RecentDrafts() {
  const drafts = await listDrafts()
  if (drafts.length === 0) return null
  return (
    <Section id="recent-drafts" title="Drafts" action={<Link href="/interview/stories" className="text-xs underline-offset-4 hover:underline">Story bank</Link>}>
      <DraftList drafts={drafts.slice(0, 6)} empty="No drafts yet." />
    </Section>
  )
}
