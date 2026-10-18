import { z } from "zod"

import {
  APPLICATION_STATUSES,
  COMPANY_SIZES,
  EMPLOYMENT_TYPES,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  WORK_ARRANGEMENTS,
  requiresAppliedDate,
} from "@/lib/records/constants"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value.length > 0 ? value : null))

const optionalUrl = optionalText(2000).refine(
  (value) => value === null || /^https?:\/\//i.test(value),
  "Enter a URL that starts with http:// or https://.",
)

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date.")
  .transform((value) => (value.length > 0 ? value : null))

const optionalMoney = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^(?:\d+)(?:\.\d{1,2})?$/.test(value),
    "Enter a positive amount with up to two decimal places.",
  )
  .transform((value) => (value.length > 0 ? Number(value) : null))

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Use 200 characters or fewer."),
  size: z.enum(COMPANY_SIZES),
  location: optionalText(200),
  industry: optionalText(200),
  researchStatus: z.enum(RESEARCH_STATUSES),
  priorityTier: z.enum(PRIORITY_TIERS),
  reference: optionalText(200),
  websiteUrl: optionalUrl,
  notes: optionalText(10000),
  followUpDate: optionalDate,
})

export const applicationFieldsSchema = z
  .object({
    jobTitle: z
      .string()
      .trim()
      .min(1, "Job title is required.")
      .max(200, "Use 200 characters or fewer."),
    jobUrl: optionalUrl,
    source: optionalText(120),
    location: optionalText(200),
    workArrangement: z.enum(WORK_ARRANGEMENTS),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    salaryMin: optionalMoney,
    salaryMax: optionalMoney,
    salaryCurrency: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? value.toUpperCase() : "USD"))
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a three-letter currency code."),
    status: z.enum(APPLICATION_STATUSES),
    appliedAt: optionalDate,
    nextFollowUpDate: optionalDate,
    notes: optionalText(10000),
  })
  .refine(
    (value) =>
      value.salaryMin === null || value.salaryMax === null || value.salaryMin <= value.salaryMax,
    {
      path: ["salaryMax"],
      message: "Maximum salary must be at least the minimum.",
    },
  )
  .refine((value) => !requiresAppliedDate(value.status) || value.appliedAt !== null, {
    path: ["appliedAt"],
    message: "Applied date is required once the application leaves Saved.",
  })

export const applicationFormSchema = applicationFieldsSchema.safeExtend({
  companyMode: z.enum(["existing", "new"]),
  companyId: z.string().trim(),
  newCompanyName: z.string().trim().max(200, "Use 200 characters or fewer."),
}).refine(
  (value) =>
    value.companyMode === "new" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.companyId,
    ),
  { path: ["companyId"], message: "Choose a company." },
).refine(
  (value) => value.companyMode === "existing" || value.newCompanyName.length > 0,
  { path: ["newCompanyName"], message: "Company name is required." },
)

export type CompanyFormValues = z.infer<typeof companyFormSchema>
export type ApplicationFormValues = z.infer<typeof applicationFormSchema>

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return fieldErrors
}
