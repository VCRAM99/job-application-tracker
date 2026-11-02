import type { Metadata } from "next"
import { connection } from "next/server"

import { BuildStoriesForm } from "@/components/coach/interview-forms"
import { Badge, CoachOff, CoachUnavailable, DroppedNote } from "@/components/coach/view"
import { PageHeader } from "@/components/records/fields"
import { loadFactLabels, loadVerifiedFacts } from "@/lib/analyze/data"
import { COMPETENCY_LABELS } from "@/lib/coach/constants"
import { listStories } from "@/lib/coach/data"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { staleStory, STAR_PARTS } from "@/lib/coach/stories"
import { loadExecutionMode } from "@/lib/resume/data"

export const metadata: Metadata = { title: "Story bank" }
export const instant = false

export default async function StoryBankPage() {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const [stories, facts, mode] = await Promise.all([listStories(), loadVerifiedFacts(), loadExecutionMode()])
  if (!stories) return <CoachUnavailable />
  const labels = await loadFactLabels([...new Set(stories.flatMap((story) => story.factIds))])
  const verified = facts.ok ? facts.facts : []
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title="Story bank" description="STAR outlines from your verified facts, one per competency." />
      <BuildStoriesForm mode={mode.mode} nonce={crypto.randomUUID()} rebuild={stories.length > 0} />
      {stories.length === 0 ? <p className="text-sm text-muted-foreground">No stories yet.</p> : <DroppedNote counts={stories[0]!.dropped} label="dropped in the last build" />}
      <ul className="grid gap-4 md:grid-cols-2">
        {stories.map((story) => staleStory(story, verified) ? (
          // A cited fact is no longer verified, so the outline is no longer evidence and is not shown.
          <li key={story.id} className="flex flex-col gap-2 rounded-lg border border-dashed p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{COMPETENCY_LABELS[story.competency]}</h2>
              <Badge tone="warn">Facts changed</Badge>
            </div>
            <p className="text-muted-foreground">A fact this outline cited is no longer verified. Rebuild to refresh it.</p>
          </li>
        ) : (
          <li key={story.id} className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{COMPETENCY_LABELS[story.competency]}</h2>
            </div>
            <dl className="grid gap-2">
              {STAR_PARTS.map((part) => (
                <div key={part}>
                  <dt className="text-xs font-medium text-muted-foreground capitalize">{part}</dt>
                  <dd>{story.outline[part]}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-wrap gap-1.5" aria-label="Evidence">
              {story.factIds.map((id) => (
                <li key={id} className="rounded-full border px-2 py-0.5 text-[11px]">{labels[id] ?? "Fact no longer verified"}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
