import Link from "next/link"

import { ClaimButton, RerunButton } from "@/components/analyze/forms"
import { BLOCKER_NOTE, QUALIFICATION_DISCLAIMER, READABILITY_NOTE } from "@/lib/analyze/copy"
import type { AnalysisRecord } from "@/lib/analyze/data"
import type { GroundedRequirement, RequirementCategory, RequirementMatch } from "@/lib/analyze/types"

const KIND_LABEL = { required: "Required", preferred: "Preferred" }
const STATUS_LABEL = {
  met: "Met",
  partial: "Partial",
  not_evidenced: "Not evidenced",
  unclear: "Unclear",
}
const CATEGORY_LABEL: Record<RequirementCategory, string> = {
  skill: "Skill",
  experience_years: "Years of experience",
  education: "Education",
  certification: "Certification",
  domain: "Domain",
  work_authorization_location: "Work authorization or location",
  other: "Other",
}

function HighlightedJobText({
  text,
  requirements,
}: {
  text: string
  requirements: GroundedRequirement[]
}) {
  const spans = [...requirements].sort((left, right) => left.spanStart - right.spanStart)
  const parts: Array<{ key: string; text: string; mark: boolean }> = []
  let cursor = 0
  spans.forEach((requirement, index) => {
    if (requirement.spanStart < cursor || requirement.spanEnd > text.length) return
    if (requirement.spanStart > cursor) {
      parts.push({ key: `gap-${index}`, text: text.slice(cursor, requirement.spanStart), mark: false })
    }
    parts.push({
      key: requirement.id,
      text: text.slice(requirement.spanStart, requirement.spanEnd),
      mark: true,
    })
    cursor = requirement.spanEnd
  })
  if (cursor < text.length) parts.push({ key: "end", text: text.slice(cursor), mark: false })
  return (
    <p className="text-sm leading-6 whitespace-pre-wrap">
      {parts.map((part) =>
        part.mark ? (
          <mark id={`quote-${part.key}`} key={part.key} className="bg-amber-200/80 text-foreground dark:bg-amber-300/30">
            {part.text}
          </mark>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </p>
  )
}

export function AnalysisResult({
  analysis,
  factLabels,
  executionMode,
  reused,
}: {
  analysis: AnalysisRecord
  factLabels: Record<string, string>
  executionMode: "managed" | "byok" | null
  reused: boolean
}) {
  const matches = new Map(analysis.matches.map((match) => [match.requirementId, match]))
  const claimed = new Set(analysis.claims.map((claim) => claim.requirementId))
  const learningGaps = analysis.requirements.filter((requirement) => {
    const match = matches.get(requirement.id)
    return match?.status === "not_evidenced" && !claimed.has(requirement.id)
  })
  const mayHave = analysis.requirements.filter((requirement) => {
    const match = matches.get(requirement.id)
    return match?.status === "partial" && !claimed.has(requirement.id)
  })
  const scoreText = analysis.score == null ? "Not scored" : `${analysis.score} / 100`
  const coverage =
    analysis.coverageConfidence == null ? "Not available" : `${Math.round(analysis.coverageConfidence * 100)}%`

  return (
    <div className="grid gap-6">
      {reused ? (
        <p className="rounded-lg border px-3 py-2 text-sm" role="status">
          This completed analysis was reused. The model was not called again.
        </p>
      ) : null}
      {analysis.status === "failed" ? (
        <p className="text-sm text-destructive" role="alert">
          This run failed{analysis.errorCode ? ` (${analysis.errorCode})` : ""}. Re-check to try again.
        </p>
      ) : null}
      <section className="surface grid gap-3 p-4" aria-labelledby="score-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="score-heading" className="text-sm font-medium text-muted-foreground">Qualification match estimate</h2>
            <p className="text-3xl font-semibold tracking-tight">{scoreText}</p>
          </div>
          {executionMode ? <RerunButton analysisId={analysis.id} executionMode={executionMode} /> : null}
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{QUALIFICATION_DISCLAIMER}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Coverage confidence</dt>
            <dd>{coverage}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scorable requirements</dt>
            <dd>{analysis.breakdown.scorableCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Unclear, left out of the score</dt>
            <dd>{analysis.breakdown.unclearCount ?? 0}</dd>
          </div>
        </dl>
        {analysis.droppedRequirementCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {analysis.droppedRequirementCount} extracted {analysis.droppedRequirementCount === 1 ? "requirement was" : "requirements were"} dropped because the quote was not found in the job text or the list was over the cap.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3" aria-labelledby="blocker-heading">
        <h2 id="blocker-heading" className="text-base font-medium">Separate checks</h2>
        <p className="text-sm leading-6 text-muted-foreground">{BLOCKER_NOTE}</p>
        {analysis.blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work-authorization, location, or years shortfall was recorded.</p>
        ) : (
          <ul className="grid gap-2">
            {analysis.blockers.map((blocker) => (
              <li key={blocker.requirementId} className="rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{CATEGORY_LABEL[blocker.kind === "experience_years" ? "experience_years" : "work_authorization_location"]}. </span>
                {blocker.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="requirements-heading">
        <h2 id="requirements-heading" className="text-base font-medium">Requirements</h2>
        {analysis.requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No grounded requirements were kept.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Requirements compared with verified career facts</caption>
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Requirement</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kind</th>
                  <th scope="col" className="px-3 py-2 font-medium">Category</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Verified facts</th>
                </tr>
              </thead>
              <tbody>
                {analysis.requirements.map((requirement) => (
                  <RequirementRow
                    key={requirement.id}
                    requirement={requirement}
                    match={matches.get(requirement.id)}
                    factLabels={factLabels}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="job-text-heading">
        <h2 id="job-text-heading" className="text-base font-medium">Job text</h2>
        <HighlightedJobText text={analysis.jdText} requirements={analysis.requirements} />
      </section>

      <section className="grid gap-4" aria-labelledby="gaps-heading">
        <h2 id="gaps-heading" className="text-base font-medium">Gaps</h2>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Learning gaps</h3>
          {learningGaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No not-evidenced requirements are waiting for a suggestion.</p>
          ) : (
            learningGaps.map((requirement) => (
              <article key={requirement.id} className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm">{requirement.text}</p>
                <ClaimButton analysisId={analysis.id} requirementId={requirement.id} />
              </article>
            ))
          )}
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">You may have this</h3>
          <p className="text-sm text-muted-foreground">
            A partial match can be saved as a suggested fact. It stays unverified until you accept it on Career.
          </p>
          {mayHave.length === 0 ? (
            <p className="text-sm text-muted-foreground">No partial matches are waiting.</p>
          ) : (
            mayHave.map((requirement) => (
              <article key={requirement.id} className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm">{requirement.text}</p>
                <ClaimButton analysisId={analysis.id} requirementId={requirement.id} />
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="readability-heading">
        <h2 id="readability-heading" className="text-base font-medium">Readability heuristics</h2>
        <p className="text-sm leading-6 text-muted-foreground">{READABILITY_NOTE}</p>
        {analysis.readability ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Headings</dt>
              <dd>{analysis.readability.headings.length > 0 ? analysis.readability.headings.join(", ") : "None found"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contact block</dt>
              <dd>{analysis.readability.hasContactBlock ? "Email or phone found" : "Not found"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date formats</dt>
              <dd>
                {analysis.readability.dateFormats.length === 0
                  ? "None found"
                  : `${analysis.readability.dateFormats.join(", ")} (${analysis.readability.dateFormatConsistent ? "consistent" : "mixed"})`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Length</dt>
              <dd>
                {analysis.readability.characterCount.toLocaleString("en-US")} characters, {analysis.readability.wordCount.toLocaleString("en-US")} words.
                {analysis.readability.lengthWithinBounds ? " Inside 400 to 8,000 characters." : " Outside 400 to 8,000 characters."}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Required skill words</dt>
              <dd>
                {analysis.readability.requiredSkillCoverage == null
                  ? "No required skills to compare."
                  : `${Math.round(analysis.readability.requiredSkillCoverage * 100)}% covered. Missing: ${analysis.readability.missingSkills.join(", ") || "none"}.`}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No pasted resume was selected, so readability heuristics were not run.</p>
        )}
        {analysis.readability && analysis.readability.notes.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {analysis.readability.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function RequirementRow({
  requirement,
  match,
  factLabels,
}: {
  requirement: GroundedRequirement
  match: RequirementMatch | undefined
  factLabels: Record<string, string>
}) {
  const status = match?.status ?? "unclear"
  return (
    <tr className="border-b align-top last:border-b-0">
      <th scope="row" className="px-3 py-3 font-normal">
        <p>{requirement.text}</p>
        <p className="mt-1 text-muted-foreground">
          <a href={`#quote-${requirement.id}`} className="underline-offset-4 hover:underline">
            Job text: {requirement.evidenceQuote}
          </a>
        </p>
        {match?.rationale ? <p className="mt-1 text-muted-foreground">{match.rationale}</p> : null}
      </th>
      <td className="px-3 py-3">{KIND_LABEL[requirement.kind]}</td>
      <td className="px-3 py-3">{CATEGORY_LABEL[requirement.category]}</td>
      <td className="px-3 py-3">{STATUS_LABEL[status]}</td>
      <td className="px-3 py-3">
        {match && match.factIds.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {match.factIds.map((factId) => (
              <li key={factId}>
                <Link
                  href={`/career#fact-${factId}`}
                  className="inline-flex rounded-full border px-2 py-0.5 text-xs underline-offset-4 hover:underline"
                >
                  {factLabels[factId] ?? "Verified fact"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </td>
    </tr>
  )
}
