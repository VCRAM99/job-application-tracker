import { canonicalSkill } from "@/lib/analyze/facts"
import type { GroundedRequirement, ReadabilityReport } from "@/lib/analyze/types"

const HEADING =
  /^(summary|profile|experience|work experience|employment|education|skills|projects|certifications|contact)\b/i

export function readabilityReport(
  sourceId: string,
  resumeText: string,
  requirements: GroundedRequirement[],
): ReadabilityReport {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim())
  const headings = lines.filter((line) => line.length > 0 && line.length <= 40 && HEADING.test(line))
  const hasContactBlock = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resumeText) || /\+?\d[\d().\-\s]{7,}\d/.test(resumeText)
  const dateFormats = new Set<string>()
  if (/\b\d{4}-\d{2}\b/.test(resumeText)) dateFormats.add("YYYY-MM")
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(resumeText)) {
    dateFormats.add("Month YYYY")
  }
  if (/\b\d{1,2}\/\d{4}\b/.test(resumeText)) dateFormats.add("MM/YYYY")
  const words = resumeText.trim().split(/\s+/).filter(Boolean)
  const characterCount = resumeText.trim().length
  const lengthWithinBounds = characterCount >= 400 && characterCount <= 8000
  const requiredSkills = [
    ...new Set(
      requirements
        .filter((requirement) => requirement.kind === "required" && requirement.category === "skill")
        .flatMap((requirement) =>
          requirement.normalizedSkills.length > 0
            ? requirement.normalizedSkills.map(canonicalSkill)
            : [canonicalSkill(requirement.text)],
        )
        .filter((skill) => skill.length > 1),
    ),
  ]
  const resumeCanonical = canonicalSkill(resumeText)
  const coveredSkills = requiredSkills.filter((skill) => resumeCanonical.includes(skill))
  const missingSkills = requiredSkills.filter((skill) => !coveredSkills.includes(skill))
  const notes: string[] = []
  if (headings.length === 0) notes.push("No common section headings were found.")
  if (!hasContactBlock) notes.push("No email address or phone number was found.")
  if (dateFormats.size > 1) notes.push("More than one date format is in use.")
  if (!lengthWithinBounds) notes.push("Length is outside 400 to 8,000 characters.")
  if (requiredSkills.length > 0 && missingSkills.length > 0) {
    notes.push("Some required skill words do not appear in the pasted resume text.")
  }
  return {
    label: "readability heuristics",
    sourceId,
    headings,
    hasContactBlock,
    dateFormats: [...dateFormats],
    dateFormatConsistent: dateFormats.size <= 1,
    characterCount,
    wordCount: words.length,
    lengthWithinBounds,
    requiredSkillCoverage: requiredSkills.length === 0 ? null : coveredSkills.length / requiredSkills.length,
    coveredSkills,
    missingSkills,
    notes,
  }
}
