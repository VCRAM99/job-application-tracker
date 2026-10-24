import {
  asNumber,
  asRecord,
  asString,
  employmentType,
  explicitCountry,
  finishJob,
  httpsUrl,
  salaryPeriod,
  seniorityFromTitle,
  workArrangement,
  type NormalizedJob,
  type RejectedJob,
} from "@/lib/jobs/normalize"
import { loadPayload, type AdapterPage, type FetchInput } from "@/lib/jobs/sources/types"
import { leverPostingsUrl } from "@/lib/jobs/urls"

const PAGE_SIZE = 100

function locations(record: Record<string, unknown>): string | null {
  const categories = asRecord(record.categories)
  const primary = asString(categories?.location)
  const all = Array.isArray(categories?.allLocations)
    ? categories.allLocations.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const unique = [...new Set([primary, ...all].filter((item): item is string => Boolean(item)))]
  return unique.length > 0 ? unique.join(" · ") : null
}

export function normalizeLeverJobs(
  payload: unknown,
  input: Pick<FetchInput, "employerName" | "employerDomain">,
): { jobs: NormalizedJob[]; rejected: RejectedJob[] } {
  if (!Array.isArray(payload)) {
    return { jobs: [], rejected: [{ sourceJobId: null, reason: "malformed_payload" }] }
  }
  const jobs: NormalizedJob[] = []
  const rejected: RejectedJob[] = []
  for (const item of payload) {
    const record = asRecord(item)
    const sourceJobId = asString(record?.id)
    const title = asString(record?.text)
    const listingUrl = httpsUrl(record?.hostedUrl)
    if (!record || !sourceJobId || !title || !listingUrl) {
      rejected.push({ sourceJobId, reason: "missing_required_fields" })
      continue
    }
    const categories = asRecord(record.categories)
    const salary = asRecord(record.salaryRange)
    const currencyRaw = asString(salary?.currency)
    const description = asString(record.descriptionPlain)
    const country = asString(record.country)
    jobs.push(
      finishJob({
        provider: "lever",
        sourceJobId,
        employerName: input.employerName,
        employerDomain: input.employerDomain,
        title,
        locationText: locations(record),
        countryCode: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : explicitCountry(locations(record)),
        region: null,
        workArrangement: workArrangement(asString(record.workplaceType), null),
        employmentType: employmentType(asString(categories?.commitment)),
        seniority: seniorityFromTitle(title),
        compensationMin: asNumber(salary?.min),
        compensationMax: asNumber(salary?.max),
        currency: currencyRaw && /^[A-Za-z]{3}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : null,
        salaryPeriod: salaryPeriod(asString(salary?.interval)),
        postedAt: typeof record.createdAt === "number" ? new Date(record.createdAt).toISOString() : null,
        listingUrl,
        applicationUrl: httpsUrl(record.applyUrl) ?? listingUrl,
        applicationMethod: "ats",
        requisitionId: null,
        descriptionText: description,
        listingStatus: "active",
        provenance: {
          provider: "lever",
          workplaceType: asString(record.workplaceType),
          commitment: asString(categories?.commitment),
        },
      }),
    )
  }
  return { jobs, rejected }
}

export async function fetchLeverJobs(input: FetchInput): Promise<AdapterPage<NormalizedJob>> {
  const skip = Number(input.cursor ?? "0")
  const url = leverPostingsUrl(input.sourceIdentifier, input.region, Number.isFinite(skip) ? skip : 0)
  const payload = await loadPayload(url, input)
  const page = normalizeLeverJobs(payload, input)
  const fullPage = Array.isArray(payload) && payload.length === PAGE_SIZE
  return {
    ...page,
    nextCursor: fullPage ? String((Number.isFinite(skip) ? skip : 0) + PAGE_SIZE) : null,
    complete: page.rejected.every((item) => item.reason !== "malformed_payload") && !fullPage,
  }
}
