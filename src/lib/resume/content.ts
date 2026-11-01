import { z } from "zod"

/** Structured resume content: the parse result, the base of a version, and the export input. */
export type ResumeContent = {
  contact: { name: string | null; email: string | null; phone: string | null; location: string | null; links: string[] }
  summary: string | null
  experience: Array<{
    title: string
    company: string
    location: string | null
    start: string | null
    end: string | null
    bullets: string[]
  }>
  education: Array<{ credential: string; institution: string; year: string | null; details: string[] }>
  skills: string[]
  projects: Array<{ name: string; bullets: string[] }>
  other: Array<{ heading: string; lines: string[] }>
}

export const EMPTY_CONTENT: ResumeContent = {
  contact: { name: null, email: null, phone: null, location: null, links: [] },
  summary: null,
  experience: [],
  education: [],
  skills: [],
  projects: [],
  other: [],
}

const line = z.string().trim().min(1).max(600)
const short = z.string().trim().min(1).max(200)
const nullableShort = z.string().trim().max(200).nullable()

export const resumeContentSchema = z.object({
  contact: z.object({
    name: nullableShort,
    email: nullableShort,
    phone: nullableShort,
    location: nullableShort,
    links: z.array(short).max(10),
  }),
  summary: z.string().trim().max(2000).nullable(),
  experience: z
    .array(
      z.object({
        title: short,
        company: short,
        location: nullableShort,
        start: nullableShort,
        end: nullableShort,
        bullets: z.array(line).max(30),
      }),
    )
    .max(30),
  education: z.array(z.object({ credential: short, institution: short, year: nullableShort, details: z.array(line).max(10) })).max(10),
  skills: z.array(z.string().trim().min(1).max(80)).max(100),
  projects: z.array(z.object({ name: short, bullets: z.array(line).max(15) })).max(15),
  other: z.array(z.object({ heading: short, lines: z.array(line).max(30) })).max(10),
})

const str = { type: "string" }
const nullableStr = { type: ["string", "null"] }
const strings = { type: "array", items: str }
function object(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) }
}

/** Provider schema. Every field is required and nullable where empty, so strict structured output accepts it. */
export const RESUME_CONTENT_JSON_SCHEMA: Record<string, unknown> = object({
  contact: object({ name: nullableStr, email: nullableStr, phone: nullableStr, location: nullableStr, links: strings }),
  summary: nullableStr,
  experience: {
    type: "array",
    items: object({ title: str, company: str, location: nullableStr, start: nullableStr, end: nullableStr, bullets: strings }),
  },
  education: { type: "array", items: object({ credential: str, institution: str, year: nullableStr, details: strings }) },
  skills: strings,
  projects: { type: "array", items: object({ name: str, bullets: strings }) },
  other: { type: "array", items: object({ heading: str, lines: strings }) },
})

/** Plain text in reading order, used for readability heuristics and previews. */
export function contentToText(content: ResumeContent): string {
  const lines: string[] = []
  const contact = [content.contact.email, content.contact.phone, content.contact.location, ...content.contact.links].filter(Boolean)
  if (content.contact.name) lines.push(content.contact.name)
  if (contact.length > 0) lines.push(contact.join(" | "))
  if (content.summary) lines.push("Summary", content.summary)
  if (content.experience.length > 0) {
    lines.push("Experience")
    for (const job of content.experience) {
      lines.push([job.title, job.company, job.location, [job.start, job.end].filter(Boolean).join(" - ")].filter(Boolean).join(", "))
      for (const bullet of job.bullets) lines.push(`- ${bullet}`)
    }
  }
  if (content.education.length > 0) {
    lines.push("Education")
    for (const item of content.education) {
      lines.push([item.credential, item.institution, item.year].filter(Boolean).join(", "))
      for (const detail of item.details) lines.push(`- ${detail}`)
    }
  }
  if (content.skills.length > 0) lines.push("Skills", content.skills.join(", "))
  if (content.projects.length > 0) {
    lines.push("Projects")
    for (const project of content.projects) {
      lines.push(project.name)
      for (const bullet of project.bullets) lines.push(`- ${bullet}`)
    }
  }
  for (const section of content.other) lines.push(section.heading, ...section.lines)
  return lines.join("\n")
}
