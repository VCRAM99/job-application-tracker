import { z } from "zod"

import { SOURCE_TEXT_LIMIT } from "@/lib/career/constants"

const currency = z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.")

export const profileFormSchema = z.object({
  summary: z.string().trim().max(4000, "Keep the summary under 4,000 characters."),
  targetRoles: z.string().trim().max(500),
  countries: z.string().trim().max(80),
  remote: z.boolean(),
  hybrid: z.boolean(),
  onsite: z.boolean(),
  salaryFloor: z.string().trim(),
  salaryCurrency: z.union([currency, z.literal("")]),
})

export const sourceFormSchema = z.object({
  label: z.string().trim().min(1, "Name this resume.").max(120),
  body: z
    .string()
    .trim()
    .min(1, "Paste the resume text.")
    .max(SOURCE_TEXT_LIMIT, "That resume is too long to store as text."),
})

export const settingsFormSchema = z.object({
  executionMode: z.enum(["managed", "byok"]),
  provider: z.enum(["openai", "anthropic", "google"]),
  model: z.string().trim().min(1).max(80),
})

export const credentialFormSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  secret: z.string().trim().min(20).max(500),
})

export function parseTokenList(
  value: string,
  pattern: RegExp,
  limit: number,
): { ok: true; items: string[] } | { ok: false } {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (items.length > limit || items.some((item) => !pattern.test(item))) return { ok: false }
  return { ok: true, items }
}

export function arrangementsFrom(input: { remote: boolean; hybrid: boolean; onsite: boolean }) {
  const values: Array<"remote" | "hybrid" | "onsite"> = []
  if (input.remote) values.push("remote")
  if (input.hybrid) values.push("hybrid")
  if (input.onsite) values.push("onsite")
  return values
}

export type ProfileFormValues = z.infer<typeof profileFormSchema>
export type SourceFormValues = z.infer<typeof sourceFormSchema>
