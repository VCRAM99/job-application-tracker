import { z } from "zod"

import { REQUIREMENT_CATEGORIES, REQUIREMENT_KINDS, MATCH_STATUSES } from "@/lib/analyze/types"

const requirementSchema = z
  .object({
    text: z.string().trim().min(1).max(400),
    kind: z.enum(REQUIREMENT_KINDS),
    category: z.enum(REQUIREMENT_CATEGORIES),
    normalizedSkills: z.array(z.string().trim().min(1).max(80)).max(12),
    minYears: z.number().int().min(0).max(60).nullable(),
    evidenceQuote: z.string().trim().min(1).max(500),
  })
  .strict()

export const extractionSchema = z
  .object({
    requirements: z.array(requirementSchema).max(60),
  })
  .strict()

export const matchSchema = z
  .object({
    matches: z
      .array(
        z
          .object({
            requirementId: z.string().trim().min(1).max(40),
            status: z.enum(MATCH_STATUSES),
            factIds: z.array(z.string().trim().min(1).max(80)).max(12),
            rationale: z.string().trim().max(500),
          })
          .strict(),
      )
      .max(60),
  })
  .strict()

export type JobExtraction = z.infer<typeof extractionSchema>
export type JobMatchResponse = z.infer<typeof matchSchema>

const nullableNumber = { type: ["number", "null"] }

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  }
}

export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirements: {
      type: "array",
      maxItems: 60,
      items: objectSchema(
        {
          text: { type: "string" },
          kind: { type: "string", enum: [...REQUIREMENT_KINDS] },
          category: { type: "string", enum: [...REQUIREMENT_CATEGORIES] },
          normalizedSkills: { type: "array", maxItems: 12, items: { type: "string" } },
          minYears: nullableNumber,
          evidenceQuote: { type: "string" },
        },
        ["text", "kind", "category", "normalizedSkills", "minYears", "evidenceQuote"],
      ),
    },
  },
  required: ["requirements"],
}

export const MATCH_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      maxItems: 60,
      items: objectSchema(
        {
          requirementId: { type: "string" },
          status: { type: "string", enum: [...MATCH_STATUSES] },
          factIds: { type: "array", maxItems: 12, items: { type: "string" } },
          rationale: { type: "string" },
        },
        ["requirementId", "status", "factIds", "rationale"],
      ),
    },
  },
  required: ["matches"],
}

export function parseExtraction(text: string): JobExtraction | null {
  try {
    const parsed = extractionSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function parseMatches(text: string): JobMatchResponse | null {
  try {
    const parsed = matchSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
