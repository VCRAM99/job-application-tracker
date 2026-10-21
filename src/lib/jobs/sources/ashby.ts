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
import { htmlToText } from "@/lib/jobs/html"
import { loadPayload, type AdapterPage, type FetchInput } from "@/lib/jobs/sources/types"
import { ashbyBoardUrl } from "@/lib/jobs/urls"

function salaryComponent(record: Record<string, unknown>): {
  min: number | null
  max: number | null
  currency: string | null
  period: ReturnType<typeof salaryPeriod>
} {
  const compensation = asRecord(record.compensation)
  const components = Array.isArray(compensation?.summaryComponents) ? compensation.summaryComponents : []
  const salary = components
    .map((item) => asRecord(item))
    .find((item) => item && asString(item.compensationType) === "Salary")
  if (!salary) return { min: null, max: null, currency: null, period: "unknown" }
  const currency = asString(salary.currencyCode)
  return {
    min: asNumber(salary.minValue),
    max: asNumber(salary.maxValue),
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
    period: salaryPeriod(asString(salary.interval)),
  }
}

function countryFrom(record: Record<string, unknown>, locationText: string | null): string | null {
  const address = asRecord(record.address)
  const postal = asRecord(address?.postalAddress)
  const raw = asString(postal?.addressCountry)
  if (raw && /^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  return explicitCountry(raw) ?? explicitCountry(locationText)
}

export function normalizeAshbyJobs(
  payload: unknown,
  input: Pick<FetchInput, "employerName" | "employerDomain">,
): { jobs: NormalizedJob[]; rejected: RejectedJob[] } {
  const body = asRecord(payload)
  const jobs = body?.jobs
  if (!body || !Array.isArray(jobs)) {
    return { jobs: [], rejected: [{ sourceJobId: null, reason: "malformed_payload" }] }
  }
  const normalized: NormalizedJob[] = []
  const rejected: RejectedJob[] = []
  for (const item of jobs) {
    const record = asRecord(item)
    const listingUrl = httpsUrl(record?.jobUrl)
    const sourceJobId = asString(record?.id) ?? listingUrl
    const title = asString(record?.title)
    if (!record || !sourceJobId || !title || !listingUrl) {
      rejected.push({ sourceJobId, reason: "missing_required_fields" })
      continue
    }
    if (record.isListed === false) {
      rejected.push({ sourceJobId, reason: "unlisted" })
      continue
    }
    const secondary = Array.isArray(record.secondaryLocations)
      ? record.secondaryLocations
          .map((entry) => asString(asRecord(entry)?.location))
          .filter((entry): entry is string => Boolean(entry))
      : []
    const primary = asString(record.location)
    const locationText = [...new Set([primary, ...secondary].filter((entry): entry is string => Boolean(entry)))].join(
      " · ",
    )
    const pay = salaryComponent(record)
    const plain =
      asString(record.descriptionPlain) ??
      (asString(record.descriptionHtml) ? htmlToText(String(record.descriptionHtml)) : null)
    normalized.push(
      finishJob({
        provider: "ashby",
        sourceJobId,
        employerName: input.employerName,
        employerDomain: input.employerDomain,
        title,
        locationText: locationText || null,
        countryCode: countryFrom(record, locationText || null),
        region: asString(asRecord(asRecord(record.address)?.postalAddress)?.addressRegion),
        workArrangement: workArrangement(asString(record.workplaceType), record.isRemote === true),
        employmentType: employmentType(asString(record.employmentType)),
        seniority: seniorityFromTitle(title),
        compensationMin: pay.min,
        compensationMax: pay.max,
        currency: pay.currency,
        salaryPeriod: pay.period,
        postedAt: asString(record.publishedAt),
        listingUrl,
        applicationUrl: httpsUrl(record.applyUrl) ?? listingUrl,
        applicationMethod: "ats",
        requisitionId: null,
        descriptionText: plain,
        listingStatus: "active",
        provenance: {
          provider: "ashby",
          workplaceType: asString(record.workplaceType),
          employmentType: asString(record.employmentType),
          compensationSummary: asString(asRecord(record.compensation)?.compensationTierSummary),
        },
      }),
    )
  }
  return { jobs: normalized, rejected }
}

export async function fetchAshbyJobs(input: FetchInput): Promise<AdapterPage<NormalizedJob>> {
  const url = ashbyBoardUrl(input.sourceIdentifier)
  const payload = await loadPayload(url, input)
  const page = normalizeAshbyJobs(payload, input)
  return {
    ...page,
    nextCursor: null,
    complete: page.rejected.every((item) => item.reason !== "malformed_payload"),
  }
}
