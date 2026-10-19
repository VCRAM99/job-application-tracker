import { z } from "zod"

import {
  APPLICATION_STATUSES,
  COMPANY_SIZES,
  EMPLOYMENT_TYPES,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  WORK_ARRANGEMENTS,
} from "@/lib/records/constants"
import { isRealIsoDate } from "@/lib/import/format"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value.length > 0 ? value : null))

const optionalUrl = z
  .string()
  .trim()
  .max(2000, "Use 2000 characters or fewer.")
  .refine((value) => value === "" || /^https?:\/\//i.test(value), "Enter a URL that starts with http:// or https://.")
  .transform((value) => (value.length > 0 ? value : null))

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isRealIsoDate(value), "Use a real date in YYYY-MM-DD format.")
  .transform((value) => (value.length > 0 ? value : null))

const optionalMoney = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^(?:\d+)(?:\.\d{1,2})?$/.test(value),
    "Enter a positive amount with up to two decimal places.",
  )
  .transform((value) => (value.length > 0 ? value : null))

function enumOrDefault<T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
  label: string,
) {
  return z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : fallback))
    .refine((value): value is T[number] => (values as readonly string[]).includes(value), `Use a valid ${label}.`)
}

export const companyImportSchema = z.object({
  "Company Name": z.string().trim().min(1, "Company Name is required.").max(200, "Use 200 characters or fewer."),
  Size: enumOrDefault(COMPANY_SIZES, "unknown", "Size"),
  Location: optionalText(200),
  Industry: optionalText(200),
  "Research Status": enumOrDefault(RESEARCH_STATUSES, "not_started", "Research Status"),
  "Priority Tier": enumOrDefault(PRIORITY_TIERS, "unset", "Priority Tier"),
  Reference: optionalText(200),
  "Website URL": optionalUrl,
  Notes: optionalText(10000),
  "Follow-up Date": optionalDate,
})

export const applicationImportSchema = z
  .object({
    "Company Name": z.string().trim().min(1, "Company Name is required.").max(200, "Use 200 characters or fewer."),
    "Job Title": z.string().trim().min(1, "Job Title is required.").max(200, "Use 200 characters or fewer."),
    "Job URL": optionalUrl,
    Source: optionalText(120),
    Location: optionalText(200),
    "Work Arrangement": enumOrDefault(WORK_ARRANGEMENTS, "unknown", "Work Arrangement"),
    "Employment Type": enumOrDefault(EMPLOYMENT_TYPES, "unknown", "Employment Type"),
    "Salary Min": optionalMoney,
    "Salary Max": optionalMoney,
    "Salary Currency": z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value.toUpperCase() : "USD"))
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a three-letter Salary Currency code."),
    Status: enumOrDefault(APPLICATION_STATUSES, "saved", "Status"),
    "Applied Date": optionalDate,
    "Next Follow-up Date": optionalDate,
    Notes: optionalText(10000),
  })
  .refine(
    (value) => {
      const min = value["Salary Min"]
      const max = value["Salary Max"]
      if (min == null || max == null) return true
      return Number(min) <= Number(max)
    },
    { path: ["Salary Max"], message: "Salary Max must be at least Salary Min." },
  )

export type CompanyImportValues = z.infer<typeof companyImportSchema>
export type ApplicationImportValues = z.infer<typeof applicationImportSchema>

export function issuesFor(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path[0] ? `${String(issue.path[0])}: ` : ""
    return `${field}${issue.message}`
  })
}
