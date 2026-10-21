import type { HardFilterInput } from "@/lib/jobs/filters"
import type { AlertPosting, AlertSubscription, AlertUser } from "@/lib/jobs/alerts"
import type { MatchSignals } from "@/lib/jobs/score"

const EMPTY_FILTERS: HardFilterInput = {
  countries: [],
  workArrangements: [],
  employmentTypes: [],
  seniorities: [],
  salaryMin: null,
  salaryCurrency: null,
  includeUnknownCompensation: true,
  excludeEasyApply: false,
  postedWithinDays: null,
  excludedEmployerIds: [],
  locations: [],
  keywords: "",
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function hardFiltersFromUnknown(value: unknown, excludedEmployerIds: string[]): HardFilterInput {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    countries: stringList(record.countries),
    workArrangements: stringList(record.workArrangements),
    employmentTypes: stringList(record.employmentTypes),
    seniorities: stringList(record.seniorities),
    salaryMin: numberOrNull(record.salaryMin),
    salaryCurrency: typeof record.salaryCurrency === "string" ? record.salaryCurrency : null,
    includeUnknownCompensation: record.includeUnknownCompensation !== false,
    excludeEasyApply: record.excludeEasyApply === true,
    postedWithinDays: numberOrNull(record.postedWithinDays),
    excludedEmployerIds,
    locations: stringList(record.locations),
    keywords: typeof record.keywords === "string" ? record.keywords : "",
  }
}

function postingFromUnknown(value: unknown): AlertPosting | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || typeof row.title !== "string") return null
  return {
    id: row.id,
    title: row.title,
    titleTokens: stringList(row.titleTokens),
    skillTokens: stringList(row.skillTokens),
    seniority: typeof row.seniority === "string" ? row.seniority : "unknown",
    employerId: typeof row.employerId === "string" ? row.employerId : null,
    countryCode: typeof row.countryCode === "string" ? row.countryCode : null,
    workArrangement: typeof row.workArrangement === "string" ? row.workArrangement : "unknown",
    employmentType: typeof row.employmentType === "string" ? row.employmentType : "unknown",
    compensationMin: numberOrNull(row.compensationMin),
    compensationMax: numberOrNull(row.compensationMax),
    currency: typeof row.currency === "string" ? row.currency : null,
    salaryPeriod: typeof row.salaryPeriod === "string" ? row.salaryPeriod : "unknown",
    postedAt: typeof row.postedAt === "string" ? row.postedAt : null,
    lastVerifiedAt: typeof row.lastVerifiedAt === "string" ? row.lastVerifiedAt : null,
    applicationMethod: typeof row.applicationMethod === "string" ? row.applicationMethod : "unknown",
    locationText: typeof row.locationText === "string" ? row.locationText : null,
    skills: stringList(row.skillTokens),
  }
}

export function mapAlertWorkspace(workspace: unknown): {
  truncated: boolean
  postings: AlertPosting[]
  users: AlertUser[]
} {
  const body = workspace && typeof workspace === "object" ? (workspace as Record<string, unknown>) : {}
  const postings = Array.isArray(body.postings)
    ? body.postings.map(postingFromUnknown).filter((posting): posting is AlertPosting => posting != null)
    : []
  const users = Array.isArray(body.users)
    ? body.users.flatMap((item): AlertUser[] => {
        if (!item || typeof item !== "object") return []
        const row = item as Record<string, unknown>
        if (typeof row.userId !== "string") return []
        const excluded = stringList(row.excludedEmployerIds)
        const signals: MatchSignals = {
          skillTokens: stringList(row.skillTokens),
          roleTokens: stringList(row.roleTokens),
          experienceTokens: stringList(row.experienceTokens),
          seniorities: [],
        }
        const subscriptions = Array.isArray(row.subscriptions)
          ? row.subscriptions.flatMap((entry): AlertSubscription[] => {
              if (!entry || typeof entry !== "object") return []
              const sub = entry as Record<string, unknown>
              if (typeof sub.id !== "string") return []
              if (sub.cadence !== "daily" && sub.cadence !== "weekly") return []
              const saved = sub.savedSearch && typeof sub.savedSearch === "object"
                ? (sub.savedSearch as { filters?: unknown }).filters
                : null
              const filters = hardFiltersFromUnknown(saved ?? row.preferences ?? EMPTY_FILTERS, excluded)
              return [
                {
                  id: sub.id,
                  cadence: sub.cadence,
                  minimumMatch: numberOrNull(sub.minimumMatch) ?? 40,
                  delivery: sub.delivery === "email" || sub.delivery === "both" ? sub.delivery : "in_app",
                  timeZone: typeof sub.timezone === "string" ? sub.timezone : "UTC",
                  lastSuccessfulRunAt: typeof sub.lastSuccessfulRunAt === "string" ? sub.lastSuccessfulRunAt : null,
                  filters,
                },
              ]
            })
          : []
        return [
          {
            userId: row.userId,
            signals,
            preferredEmployerIds: stringList(row.preferredEmployerIds),
            hiddenPostingIds: stringList(row.hiddenPostingIds),
            subscriptions,
          },
        ]
      })
    : []
  return { truncated: body.truncated === true, postings, users }
}
