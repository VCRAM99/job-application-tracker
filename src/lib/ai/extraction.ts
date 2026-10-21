import { z } from "zod"

const evidence = z.string().trim().min(1).max(500)
const optionalText = (max: number) => z.string().trim().max(max).nullable()
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()

export const employmentFactSchema = z
  .object({
    organization: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    location: optionalText(200),
    startDate: optionalDate,
    endDate: optionalDate,
    current: z.boolean(),
    summary: optionalText(4000),
    evidence,
  })
  .strict()

export const educationFactSchema = z
  .object({
    institution: z.string().trim().min(1).max(200),
    credential: z.string().trim().min(1).max(200),
    fieldOfStudy: optionalText(200),
    startDate: optionalDate,
    endDate: optionalDate,
    summary: optionalText(4000),
    evidence,
  })
  .strict()

export const skillFactSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: optionalText(80),
    evidence,
  })
  .strict()

export const projectFactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    roleTitle: optionalText(200),
    url: z.string().trim().url().nullable(),
    summary: optionalText(4000),
    evidence,
  })
  .strict()

export const accomplishmentFactSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: optionalText(4000),
    evidence,
  })
  .strict()

export const certificationFactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    issuer: optionalText(200),
    issuedOn: optionalDate,
    expiresOn: optionalDate,
    credentialUrl: z.string().trim().url().nullable(),
    evidence,
  })
  .strict()

export const FACT_TYPES = [
  "employment",
  "education",
  "skill",
  "project",
  "accomplishment",
  "certification",
] as const

export type FactType = (typeof FACT_TYPES)[number]

export const extractionSchema = z
  .object({
    employment: z.array(employmentFactSchema).max(20),
    education: z.array(educationFactSchema).max(20),
    skills: z.array(skillFactSchema).max(40),
    projects: z.array(projectFactSchema).max(20),
    accomplishments: z.array(accomplishmentFactSchema).max(20),
    certifications: z.array(certificationFactSchema).max(20),
  })
  .strict()

export type CareerExtraction = z.infer<typeof extractionSchema>

const nullableString = { type: ["string", "null"] }
const nullableDate = { anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, { type: "null" }] }

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
    employment: {
      type: "array",
      maxItems: 20,
      items: objectSchema(
        {
          organization: { type: "string" },
          title: { type: "string" },
          location: nullableString,
          startDate: nullableDate,
          endDate: nullableDate,
          current: { type: "boolean" },
          summary: nullableString,
          evidence: { type: "string" },
        },
        ["organization", "title", "location", "startDate", "endDate", "current", "summary", "evidence"],
      ),
    },
    education: {
      type: "array",
      maxItems: 20,
      items: objectSchema(
        {
          institution: { type: "string" },
          credential: { type: "string" },
          fieldOfStudy: nullableString,
          startDate: nullableDate,
          endDate: nullableDate,
          summary: nullableString,
          evidence: { type: "string" },
        },
        ["institution", "credential", "fieldOfStudy", "startDate", "endDate", "summary", "evidence"],
      ),
    },
    skills: {
      type: "array",
      maxItems: 40,
      items: objectSchema(
        { name: { type: "string" }, category: nullableString, evidence: { type: "string" } },
        ["name", "category", "evidence"],
      ),
    },
    projects: {
      type: "array",
      maxItems: 20,
      items: objectSchema(
        {
          name: { type: "string" },
          roleTitle: nullableString,
          url: nullableString,
          summary: nullableString,
          evidence: { type: "string" },
        },
        ["name", "roleTitle", "url", "summary", "evidence"],
      ),
    },
    accomplishments: {
      type: "array",
      maxItems: 20,
      items: objectSchema(
        { title: { type: "string" }, summary: nullableString, evidence: { type: "string" } },
        ["title", "summary", "evidence"],
      ),
    },
    certifications: {
      type: "array",
      maxItems: 20,
      items: objectSchema(
        {
          name: { type: "string" },
          issuer: nullableString,
          issuedOn: nullableDate,
          expiresOn: nullableDate,
          credentialUrl: nullableString,
          evidence: { type: "string" },
        },
        ["name", "issuer", "issuedOn", "expiresOn", "credentialUrl", "evidence"],
      ),
    },
  },
  required: ["employment", "education", "skills", "projects", "accomplishments", "certifications"],
}

export function factSchema(type: FactType) {
  switch (type) {
    case "employment":
      return employmentFactSchema
    case "education":
      return educationFactSchema
    case "skill":
      return skillFactSchema
    case "project":
      return projectFactSchema
    case "accomplishment":
      return accomplishmentFactSchema
    case "certification":
      return certificationFactSchema
  }
}

export function isFactType(value: string): value is FactType {
  return (FACT_TYPES as readonly string[]).includes(value)
}
