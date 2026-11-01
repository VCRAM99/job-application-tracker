import { EditDecision } from "@/components/resume/forms"
import { HelpTip } from "@/components/ui/help-tip"
import type { ReadabilityReport } from "@/lib/analyze/types"
import type { ResumeContent } from "@/lib/resume/content"
import type { ResumeEdit } from "@/lib/resume/tailor"

/** The same single-column order the exports use. */
export function ResumePreview({ content }: { content: ResumeContent }) {
  const contact = [content.contact.email, content.contact.phone, content.contact.location, ...content.contact.links].filter(Boolean)
  return (
    <article className="flex flex-col gap-4 rounded-lg border p-5 text-sm leading-6">
      {content.contact.name ? <h2 className="text-lg font-semibold">{content.contact.name}</h2> : null}
      {contact.length > 0 ? <p className="-mt-3 text-muted-foreground">{contact.join(" | ")}</p> : null}
      {content.summary ? <Section title="Summary"><p>{content.summary}</p></Section> : null}
      {content.experience.length > 0 ? (
        <Section title="Experience">
          {content.experience.map((job, index) => (
            <div key={index} className="flex flex-col gap-1">
              <p className="font-medium">
                {job.title}, {job.company}
                <span className="font-normal text-muted-foreground">
                  {[job.location, [job.start, job.end].filter(Boolean).join(" - ")].filter(Boolean).map((part) => ` | ${part}`)}
                </span>
              </p>
              <Bullets items={job.bullets} />
            </div>
          ))}
        </Section>
      ) : null}
      {content.education.length > 0 ? (
        <Section title="Education">
          {content.education.map((item, index) => (
            <div key={index}>
              <p className="font-medium">
                {item.credential}, {item.institution}
                {item.year ? <span className="font-normal text-muted-foreground"> | {item.year}</span> : null}
              </p>
              <Bullets items={item.details} />
            </div>
          ))}
        </Section>
      ) : null}
      {content.skills.length > 0 ? <Section title="Skills"><p>{content.skills.join(", ")}</p></Section> : null}
      {content.projects.length > 0 ? (
        <Section title="Projects">
          {content.projects.map((project, index) => (
            <div key={index}>
              <p className="font-medium">{project.name}</p>
              <Bullets items={project.bullets} />
            </div>
          ))}
        </Section>
      ) : null}
      {content.other.map((section, index) => (
        <Section key={index} title={section.heading}>
          {section.lines.map((line, lineIndex) => (
            <p key={lineIndex}>{line}</p>
          ))}
        </Section>
      ))}
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="ml-4 list-disc">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

const OP_LABELS: Record<ResumeEdit["op"], string> = {
  rewrite_bullet: "Rewrite",
  reorder_bullets: "Reorder",
  add_skill: "Add skill",
  remove_item: "Remove",
  edit_summary: "Summary",
}

function targetLabel(target: string): string {
  if (target === "summary") return "Summary"
  if (target === "skills") return "Skills"
  const skill = /^skills\[(\d+)\]$/.exec(target)
  if (skill) return `Skill ${Number(skill[1]) + 1}`
  const match = /^(experience|projects)\[(\d+)\]\.bullets(?:\[(\d+)\])?$/.exec(target)
  if (!match) return target
  const section = match[1] === "experience" ? "Role" : "Project"
  return match[3] ? `${section} ${Number(match[2]) + 1} · bullet ${Number(match[3]) + 1}` : `${section} ${Number(match[2]) + 1} · bullets`
}

export function EditCard({
  edit,
  versionId,
  base,
  factLabels,
}: {
  edit: ResumeEdit
  versionId: string
  base: ResumeContent
  factLabels: Record<string, string>
}) {
  const reorder = edit.op === "reorder_bullets" ? /^(experience|projects)\[(\d+)\]/.exec(edit.target) : null
  const bullets = reorder ? base[reorder[1] as "experience" | "projects"][Number(reorder[2])]?.bullets ?? [] : []
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4" data-status={edit.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{OP_LABELS[edit.op]}</span> · {targetLabel(edit.target)}
          {edit.status !== "pending" ? <span className="ml-2 rounded border px-1.5 py-0.5 text-[11px] capitalize">{edit.status}</span> : null}
        </p>
        <EditDecision versionId={versionId} editId={edit.id} status={edit.status} />
      </div>
      {edit.op === "reorder_bullets" ? (
        <ol className="ml-4 list-decimal text-sm">
          {edit.order.map((index) => (
            <li key={index}>{bullets[index]}</li>
          ))}
        </ol>
      ) : (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded bg-muted/50 p-2 text-muted-foreground">
            <span className="sr-only">Before: </span>
            {edit.before ? <del className="no-underline">{edit.before}</del> : <em>New</em>}
          </p>
          <p className="rounded bg-muted p-2">
            <span className="sr-only">After: </span>
            {edit.op === "remove_item" ? <em>Removed</em> : edit.after}
          </p>
        </div>
      )}
      {edit.rationale ? <p className="text-xs text-muted-foreground">{edit.rationale}</p> : null}
      {edit.factIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Evidence">
          {edit.factIds.map((id) => (
            <li key={id} className="rounded-full border px-2 py-0.5 text-[11px]">
              {factLabels[id] ?? "Verified fact"}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function ReadabilityCompare({ before, after }: { before: ReadabilityReport | null; after: ReadabilityReport | null }) {
  if (!before || !after) return null
  const rows: Array<[string, string, string]> = [
    ["Required skill words", percent(before.requiredSkillCoverage), percent(after.requiredSkillCoverage)],
    ["Section headings", String(before.headings.length), String(after.headings.length)],
    ["Words", String(before.wordCount), String(after.wordCount)],
    ["Date formats consistent", before.dateFormatConsistent ? "Yes" : "No", after.dateFormatConsistent ? "Yes" : "No"],
  ]
  return (
    <section className="flex flex-col gap-2" aria-labelledby="readability-heading">
      <div className="flex items-center gap-2">
        <h2 id="readability-heading" className="text-sm font-medium">Readability heuristics</h2>
        <HelpTip label="About readability">Simple text checks before and after accepted edits. Missing skills: {after.missingSkills.join(", ") || "none"}.</HelpTip>
      </div>
      <p className="text-xs text-muted-foreground">Not an ATS score.</p>
      <table className="w-full max-w-md text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-normal">Check</th>
            <th className="py-1 font-normal">Before</th>
            <th className="py-1 font-normal">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, left, right]) => (
            <tr key={label} className="border-t">
              <td className="py-1">{label}</td>
              <td className="py-1">{left}</td>
              <td className="py-1">{right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`
}
