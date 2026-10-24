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
  type NormalizedJob,
  type RejectedJob,
} from "@/lib/jobs/normalize"
import { htmlToText } from "@/lib/jobs/html"
import { loadPayload, type AdapterPage, type FetchInput } from "@/lib/jobs/sources/types"
import { greenhouseJobsUrl } from "@/lib/jobs/urls"

function pay(record: Record<string, unknown>): {
  min: number | null
  max: number | null
  currency: string | null
} {
  const ranges = record.pay_input_ranges
  if (!Array.isArray(ranges) || !ranges[0] || typeof ranges[0] !== "object") {
    return { min: null, max: null, currency: null }
  }
  const first = ranges[0] as Record<string, unknown>
  const minCents = asNumber(first.min_cents)
  const maxCents = asNumber(first.max_cents)
  const currency = asString(first.currency_type)
  return {
    min: minCents == null ? null : minCents / 100,
    max: maxCents == null ? null : maxCents / 100,
    currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null,
  }
}

export function normalizeGreenhouseJobs(
  payload: unknown,
  input: Pick<FetchInput, "employerName" | "employerDomain" | "now">,
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
    const sourceJobId = record?.id == null ? null : String(record.id)
    const title = asString(record?.title)
    const listingUrl = httpsUrl(record?.absolute_url)
    if (!record || !sourceJobId || !title || !listingUrl) {
      rejected.push({ sourceJobId, reason: "missing_required_fields" })
      continue
    }
    const location = asRecord(record.location)
    const locationText = asString(location?.name)
    const compensation = pay(record)
    const description = asString(record.content) ? htmlToText(String(record.content)) : null
    const company = asString(record.company_name) ?? input.employerName
    normalized.push(
      finishJob({
        provider: "greenhouse",
        sourceJobId,
        employerName: company,
        employerDomain: input.employerDomain,
        title,
        locationText,
        countryCode: explicitCountry(locationText),
        region: null,
        workArrangement: locationText?.toLowerCase() === "remote" ? "remote" : "unknown",
        employmentType: employmentType(null),
        seniority: seniorityFromTitle(title),
        compensationMin: compensation.min,
        compensationMax: compensation.max,
        currency: compensation.currency,
        salaryPeriod: compensation.min == null && compensation.max == null ? "unknown" : salaryPeriod(null),
        postedAt: null,
        listingUrl,
        applicationUrl: listingUrl,
        applicationMethod: "ats",
        requisitionId: asString(record.requisition_id),
        descriptionText: description,
        listingStatus: "active",
        provenance: {
          provider: "greenhouse",
          updatedAt: asString(record.updated_at),
          internalJobId: record.internal_job_id == null ? null : String(record.internal_job_id),
          payPeriodProvided: false,
        },
      }),
    )
  }
  return { jobs: normalized, rejected }
}

export async function fetchGreenhouseJobs(input: FetchInput): Promise<AdapterPage<NormalizedJob>> {
  const url = greenhouseJobsUrl(input.sourceIdentifier)
  const payload = await loadPayload(url, input)
  const page = normalizeGreenhouseJobs(payload, input)
  return { ...page, nextCursor: null, complete: page.rejected.every((item) => item.reason !== "malformed_payload") }
}
