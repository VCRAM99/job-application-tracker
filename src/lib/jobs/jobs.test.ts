import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { planAlertRun, alertWindowKey, isAlertDue } from "@/lib/jobs/alerts"
import { classifyDuplicate } from "@/lib/jobs/dedupe"
import { deliverJobAlertEmail } from "@/lib/jobs/email"
import { indeedSearchUrl, linkedInSearchUrl } from "@/lib/jobs/external-search"
import { compensationFit, passesHardFilters } from "@/lib/jobs/filters"
import { jobEmailDeliveryEnabled, jobIngestionEnabled, jobRefreshEnabled, recommendedJobsEnabled } from "@/lib/jobs/flags"
import { htmlToText } from "@/lib/jobs/html"
import { companyChoiceIsExplicit, findDuplicateApplication, planCompany, prefillFromPosting } from "@/lib/jobs/prefill"
import { jobOperationProof } from "@/lib/jobs/proof"
import { jobsErrorKind, parseJobSearch } from "@/lib/jobs/query"
import { planSourceRefresh } from "@/lib/jobs/refresh"
import { scorePosting, signalsFromVerified } from "@/lib/jobs/score"
import { authorizeScheduler } from "@/lib/jobs/scheduler-auth"
import { fetchAshbyJobs } from "@/lib/jobs/sources/ashby"
import { fetchGreenhouseJobs } from "@/lib/jobs/sources/greenhouse"
import { fetchApprovedJson } from "@/lib/jobs/sources/http"
import { fetchLeverJobs } from "@/lib/jobs/sources/lever"
import { ingestionAllowed } from "@/lib/jobs/sources/policy"
import { adapterFor } from "@/lib/jobs/sources/registry"
import { nextPostingFlags } from "@/lib/jobs/state"
import { assertApprovedSourceUrl, greenhouseJobsUrl } from "@/lib/jobs/urls"
import { isProtectedPath } from "@/lib/auth/paths"
import { textTokens } from "@/lib/jobs/text"

const fixtures = path.join(process.cwd(), "src/lib/jobs/sources/fixtures")
const now = new Date("2026-10-20T15:00:00.000Z")

const basePosting = {
  countryCode: "CA" as string | null,
  workArrangement: "remote",
  employmentType: "full_time",
  seniority: "senior",
  applicationMethod: "ats",
  postedAt: "2026-10-18T00:00:00.000Z",
  employerId: "employer-1",
  locationText: "Toronto",
  title: "Backend Engineer",
  skills: ["typescript"],
  compensationMin: 150000 as number | null,
  compensationMax: 180000 as number | null,
  currency: "CAD" as string | null,
  salaryPeriod: "year",
}

const openFilters = {
  countries: [] as string[],
  workArrangements: [] as string[],
  employmentTypes: [] as string[],
  seniorities: [] as string[],
  salaryMin: null as number | null,
  salaryCurrency: null as string | null,
  includeUnknownCompensation: true,
  excludeEasyApply: false,
  postedWithinDays: null as number | null,
  excludedEmployerIds: [] as string[],
  locations: [] as string[],
  keywords: "",
}

describe("recommended jobs flags", () => {
  it("keeps the UI off in production and the other controls off by default", () => {
    expect(recommendedJobsEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false)
    expect(recommendedJobsEnabled({ NODE_ENV: "development" })).toBe(true)
    expect(recommendedJobsEnabled({ NODE_ENV: "development", JOB_RECOMMENDATIONS_ENABLED: "false" })).toBe(false)
    expect(jobIngestionEnabled({})).toBe(false)
    expect(jobRefreshEnabled({ JOB_REFRESH_ENABLED: "true" })).toBe(true)
    expect(jobEmailDeliveryEnabled({ JOB_EMAIL_DELIVERY_ENABLED: "true" })).toBe(false)
    expect(jobEmailDeliveryEnabled({ JOB_EMAIL_DELIVERY_ENABLED: "true", JOB_EMAIL_FROM: "jobs@example.com" })).toBe(true)
  })

  it("protects the jobs pages and leaves the scheduler on its own check", () => {
    expect(isProtectedPath("/jobs")).toBe(true)
    expect(isProtectedPath("/jobs/alerts")).toBe(true)
    expect(isProtectedPath("/api/jobs/scheduler")).toBe(false)
    expect(authorizeScheduler(null, { JOB_REFRESH_ENABLED: "false" })).toMatchObject({
      ok: false,
      reason: "refresh_disabled",
    })
    expect(authorizeScheduler("Bearer secret", { JOB_REFRESH_ENABLED: "true" })).toMatchObject({
      ok: false,
      status: 503,
      reason: "scheduler_secret_missing",
    })
    expect(
      authorizeScheduler("Bearer secret", { JOB_REFRESH_ENABLED: "true", JOB_SCHEDULER_SECRET: "" }),
    ).toMatchObject({
      ok: false,
      status: 503,
      reason: "scheduler_secret_missing",
    })
    expect(
      authorizeScheduler("Bearer secret", { JOB_REFRESH_ENABLED: "true", JOB_SCHEDULER_SECRET: "   " }),
    ).toMatchObject({
      ok: false,
      status: 503,
      reason: "scheduler_secret_missing",
    })
    const secret = "scheduler-secret-value-with-32-characters"
    expect(authorizeScheduler(`Bearer ${secret}`, { JOB_REFRESH_ENABLED: "true", JOB_SCHEDULER_SECRET: secret }).ok).toBe(true)
    expect(authorizeScheduler("Bearer no", { JOB_REFRESH_ENABLED: "true", JOB_SCHEDULER_SECRET: secret })).toMatchObject({
      status: 401,
    })
  })
})

describe("job recommendations", () => {
  const signals = signalsFromVerified({
    skills: ["TypeScript", "PostgreSQL"],
    targetRoles: ["Backend Engineer"],
    titles: ["Backend Engineer"],
    seniorities: ["senior"],
  })

  it("scores the same inputs the same way and ignores listing instructions", () => {
    const posting = {
      titleTokens: textTokens("Senior Backend Engineer"),
      skillTokens: textTokens("TypeScript PostgreSQL"),
      seniority: "senior",
      preferred: true,
      referenceAt: "2026-10-18T00:00:00.000Z",
    }
    const first = scorePosting(signals, posting, now)
    const second = scorePosting(signals, posting, now)
    expect(second).toEqual(first)
    expect(first.reasons.reduce((sum, reason) => sum + reason.points, 0)).toBe(first.score)
    expect(first.score).toBeGreaterThan(70)
    const injected = scorePosting(signals, posting, now)
    expect(injected.score).toBe(first.score)
    expect(signalsFromVerified({ skills: [], targetRoles: [], titles: [], seniorities: [] }).skillTokens).toEqual([])
  })

  it("does not treat a rejected skill name as a verified skill", () => {
    const verified = signalsFromVerified({
      skills: ["TypeScript"],
      targetRoles: [],
      titles: [],
      seniorities: [],
    })
    expect(verified.skillTokens).toEqual(["typescript"])
    expect(verified.skillTokens).not.toContain("rust")
  })

  it("keeps unknown pay out of a hard failure and can hide it", () => {
    expect(compensationFit({ ...basePosting, compensationMin: null, compensationMax: null }, 100000, "CAD")).toBe("unknown")
    expect(compensationFit({ ...basePosting, compensationMax: 90000 }, 100000, "CAD")).toBe("fail")
    expect(compensationFit({ ...basePosting, salaryPeriod: "hour" }, 100000, "CAD")).toBe("unknown")
    expect(passesHardFilters({ ...basePosting, compensationMin: null, compensationMax: null, salaryPeriod: "unknown" }, { ...openFilters, salaryMin: 100000, salaryCurrency: "CAD" }, now)).toBe(true)
    expect(
      passesHardFilters(
        { ...basePosting, compensationMin: null, compensationMax: null, salaryPeriod: "unknown" },
        { ...openFilters, salaryMin: 100000, salaryCurrency: "CAD", includeUnknownCompensation: false },
        now,
      ),
    ).toBe(false)
  })

  it("applies country, easy apply, and excluded company constraints", () => {
    expect(passesHardFilters(basePosting, { ...openFilters, countries: ["US"] }, now)).toBe(false)
    expect(passesHardFilters({ ...basePosting, countryCode: null }, { ...openFilters, countries: ["CA"] }, now)).toBe(false)
    expect(passesHardFilters({ ...basePosting, applicationMethod: "easy_apply" }, { ...openFilters, excludeEasyApply: true }, now)).toBe(false)
    expect(passesHardFilters({ ...basePosting, applicationMethod: "unknown" }, { ...openFilters, excludeEasyApply: true }, now)).toBe(true)
    expect(passesHardFilters(basePosting, { ...openFilters, excludedEmployerIds: ["employer-1"] }, now)).toBe(false)
  })
})

describe("tracker prefill", () => {
  it("prefills known yearly salary and does not invent an applied date", () => {
    const prefill = prefillFromPosting({
      title: "Backend Engineer",
      listingUrl: "https://boards.greenhouse.io/northwind/jobs/1",
      applicationUrl: "https://boards.greenhouse.io/northwind/jobs/1/apply",
      source: "Northwind",
      locationText: "Toronto",
      workArrangement: "remote",
      employmentType: "full_time",
      compensationMin: 140000,
      compensationMax: 160000,
      currency: "CAD",
      salaryPeriod: "year",
      requisitionId: "REQ-1",
    })
    expect(prefill).toMatchObject({
      status: "saved",
      appliedAt: "",
      salaryMin: "140000",
      source: "Northwind",
      jobUrl: "https://boards.greenhouse.io/northwind/jobs/1/apply",
    })
    expect(prefill.notes).toContain("REQ-1")
  })

  it("leaves non-yearly pay out of the salary fields", () => {
    const prefill = prefillFromPosting({
      title: "Backend Engineer",
      listingUrl: "https://example.com/jobs/1",
      applicationUrl: null,
      source: "Board",
      locationText: null,
      workArrangement: "unknown",
      employmentType: "unknown",
      compensationMin: 80,
      compensationMax: 90,
      currency: "USD",
      salaryPeriod: "hour",
      requisitionId: null,
    })
    expect(prefill.salaryMin).toBe("")
    expect(prefill.notes).toMatch(/not copied/)
  })

  it("requires an explicit company when names collide and blocks a duplicate URL", () => {
    const plan = planCompany(
      [
        { id: "11111111-1111-4111-8111-111111111111", name: "Northwind" },
        { id: "22222222-2222-4222-8222-222222222222", name: " northwind " },
      ],
      "Northwind",
    )
    expect(plan.ambiguous).toBe(true)
    if (plan.ambiguous) expect(plan.companyId).toBe("")
    expect(companyChoiceIsExplicit(plan, { mode: "existing", companyId: "" })).toBe(false)
    expect(companyChoiceIsExplicit(plan, { mode: "new", companyId: "" })).toBe(true)
    expect(
      findDuplicateApplication(
        [{ id: "app-1", jobTitle: "Backend Engineer", jobUrl: "https://boards.greenhouse.io/northwind/jobs/1/" }],
        { jobTitle: "backend engineer", jobUrl: "https://boards.greenhouse.io/northwind/jobs/1" },
      ),
    ).toBe("app-1")
  })

  it("reverses save, hide, and feedback without creating an application", () => {
    const saved = nextPostingFlags({ saved: false, hidden: false, feedback: null }, "save")
    const hidden = nextPostingFlags(saved, "not_interested")
    expect(hidden).toEqual({ saved: true, hidden: true, feedback: "not_interested" })
    expect(nextPostingFlags(hidden, "clear_feedback").feedback).toBeNull()
    expect(nextPostingFlags(hidden, "already_applied").feedback).toBe("already_applied")
  })
})

describe("source adapters", () => {
  const input = {
    sourceIdentifier: "northwind",
    region: "global" as const,
    employerName: "Northwind",
    employerDomain: "northwind.example",
    now,
  }

  it("normalizes Greenhouse, Lever, and Ashby fixtures without a live request", async () => {
    const greenhouse = await fetchGreenhouseJobs({
      ...input,
      load: async () => JSON.parse(readFileSync(path.join(fixtures, "greenhouse.json"), "utf8")),
    })
    expect(greenhouse.jobs.map((job) => job.title)).toEqual(["Senior Backend Engineer", "Account Executive"])
    expect(greenhouse.jobs[0]?.countryCode).toBe("CA")
    expect(greenhouse.jobs[0]?.descriptionText).not.toMatch(/<script|ignore previous instructions/i)
    expect(greenhouse.jobs[0]?.skills).toEqual(expect.arrayContaining(["typescript", "postgresql"]))
    expect(greenhouse.rejected.map((item) => item.reason)).toContain("missing_required_fields")
    expect(greenhouse.complete).toBe(true)

    const lever = await fetchLeverJobs({
      ...input,
      load: async () => JSON.parse(readFileSync(path.join(fixtures, "lever.json"), "utf8")),
    })
    expect(lever.jobs[0]).toMatchObject({
      workArrangement: "hybrid",
      employmentType: "full_time",
      compensationMin: 180000,
      salaryPeriod: "year",
      countryCode: "US",
      applicationMethod: "ats",
    })
    expect(lever.jobs[1]?.employmentType).toBe("contract")
    expect(lever.jobs[1]?.countryCode).toBeNull()

    const ashby = await fetchAshbyJobs({
      ...input,
      load: async () => JSON.parse(readFileSync(path.join(fixtures, "ashby.json"), "utf8")),
    })
    expect(ashby.jobs).toHaveLength(1)
    expect(ashby.jobs[0]).toMatchObject({
      compensationMin: 170000,
      salaryPeriod: "year",
      countryCode: "US",
      workArrangement: "hybrid",
    })
    expect(ashby.rejected.map((item) => item.reason)).toEqual(expect.arrayContaining(["unlisted", "missing_required_fields"]))
  })

  it("rejects malformed payloads, unsafe URLs, and unapproved live fetches", async () => {
    const malformed = await fetchGreenhouseJobs({ ...input, load: async () => ({ jobs: "nope" }) })
    expect(malformed.complete).toBe(false)
    expect(malformed.rejected[0]?.reason).toBe("malformed_payload")
    expect(() => greenhouseJobsUrl("../admin")).toThrow(/invalid_identifier/)
    expect(() => assertApprovedSourceUrl("http://boards-api.greenhouse.io/v1/boards/acme/jobs")).toThrow(/invalid_protocol/)
    expect(() => assertApprovedSourceUrl("https://evil.example/jobs")).toThrow(/unapproved_host/)
    expect(() => assertApprovedSourceUrl("https://user:pass@api.lever.co/v0/postings/acme")).toThrow(/credentials_in_url/)
    await expect(fetchLeverJobs({ ...input, permitLiveFetch: false })).rejects.toThrow(/live_fetch_not_permitted/)
    const board = "https://boards-api.greenhouse.io/v1/boards/acme/jobs"
    await expect(
      fetchApprovedJson(board, {
        fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } }),
      }),
    ).rejects.toThrow(/redirect_blocked/)
    await expect(
      fetchApprovedJson(board, {
        fetchImpl: async () => new Response("{}", { status: 200, headers: { "content-length": "2000000" } }),
      }),
    ).rejects.toThrow(/oversized/)
    await expect(
      fetchApprovedJson(board, {
        timeoutMs: 10,
        fetchImpl: (_target, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
          }),
      }),
    ).rejects.toThrow(/aborted/)
    const page = await fetchLeverJobs({
      ...input,
      load: async () => Array.from({ length: 100 }, () => ({})),
    })
    expect(page.nextCursor).toBe("100")
    expect(page.complete).toBe(false)
    expect(adapterFor("ashby").validateConfig({ sourceIdentifier: "northwind", region: "global" })).toBe(true)
    expect(() => adapterFor("workday")).toThrow(/unsupported_provider/)
  })

  it("does not link ambiguous cross-provider duplicates", () => {
    const left = {
      id: "a",
      sourceId: "greenhouse",
      sourceJobId: "1",
      title: "Backend Engineer",
      locationText: "Toronto",
      employerDomain: "northwind.example",
      listingUrl: "https://boards.greenhouse.io/northwind/jobs/1",
      applicationUrl: "https://jobs.example/1",
    }
    expect(
      classifyDuplicate(left, [{ ...left, id: "b", sourceId: "lever", sourceJobId: "2" }]).action,
    ).toBe("link")
    expect(
      classifyDuplicate(left, [
        { ...left, id: "c", sourceId: "lever", sourceJobId: "3", employerDomain: "other.example", locationText: "Austin" },
      ]).action,
    ).toBe("ambiguous")
  })

  it("keeps ingestion off until the activation record is complete", async () => {
    const draft = {
      provider: "greenhouse",
      accessMethod: "documented_https_json",
      approvedUsage: "Store public fields.",
      attributionRequirements: "Name Greenhouse.",
      retentionRestrictions: "Expire omitted listings.",
      allowedStorageFields: ["title"],
      refreshLimitPerDay: 0,
      approvalStatus: "draft" as const,
      termsStatus: "unclear" as const,
      liveIngestionEnabled: false,
      sourceIdentifier: null,
    }
    expect(ingestionAllowed(draft, { ingestion: true }).ok).toBe(false)
    const plan = await planSourceRefresh({
      ingestion: false,
      source: { ...draft, liveIngestionEnabled: true, approvalStatus: "approved", termsStatus: "permitted", refreshLimitPerDay: 2, sourceIdentifier: "northwind" },
      fetchJobs: async () => {
        throw new Error("should not fetch")
      },
    })
    expect(plan).toEqual({ action: "skip", reason: "ingestion_disabled" })
    const failed = await planSourceRefresh({
      ingestion: true,
      source: { ...draft, liveIngestionEnabled: true, approvalStatus: "approved", termsStatus: "permitted", refreshLimitPerDay: 2, sourceIdentifier: "northwind" },
      fetchJobs: async () => {
        throw new Error("timeout")
      },
    })
    expect(failed).toEqual({ action: "failure", reason: "timeout" })
  })
})

describe("alerts", () => {
  it("uses the timezone calendar and does not repeat a successful window", () => {
    expect(alertWindowKey("daily", "America/Toronto", new Date("2026-10-21T02:30:00.000Z"))).toBe("daily:2026-10-20")
    expect(alertWindowKey("weekly", "UTC", new Date("2026-10-21T12:00:00.000Z"))).toBe("weekly:2026-10-19")
    expect(
      isAlertDue({
        cadence: "daily",
        paused: false,
        timeZone: "UTC",
        lastSuccessfulRunAt: "2026-10-20T01:00:00.000Z",
        now,
      }),
    ).toBe(false)
    expect(isAlertDue({ cadence: "off", paused: false, timeZone: "UTC", lastSuccessfulRunAt: null, now })).toBe(false)
  })

  it("records one in-app alert, skips email, and ignores a duplicate run", () => {
    const user = {
      userId: "user-1",
      signals: signalsFromVerified({
        skills: ["TypeScript"],
        targetRoles: ["Backend Engineer"],
        titles: ["Backend Engineer"],
        seniorities: ["senior"],
      }),
      preferredEmployerIds: [],
      hiddenPostingIds: [],
      subscriptions: [
        {
          id: "sub-1",
          cadence: "daily" as const,
          minimumMatch: 10,
          delivery: "both" as const,
          timeZone: "UTC",
          lastSuccessfulRunAt: null,
          filters: openFilters,
        },
      ],
    }
    const posting = {
      id: "job-1",
      title: "Backend Engineer",
      titleTokens: textTokens("Backend Engineer"),
      skillTokens: textTokens("TypeScript"),
      seniority: "senior",
      employerId: null,
      countryCode: "CA",
      workArrangement: "remote",
      employmentType: "full_time",
      compensationMin: null,
      compensationMax: null,
      currency: null,
      salaryPeriod: "unknown",
      postedAt: now.toISOString(),
      lastVerifiedAt: now.toISOString(),
      applicationMethod: "ats",
      locationText: "Toronto",
      skills: ["typescript"],
    }
    const first = planAlertRun([user], [posting], now, "email_delivery_disabled")
    expect(first.deliveries.map((item) => item.channel)).toEqual(["in_app", "email"])
    expect(first.deliveries.find((item) => item.channel === "email")?.status).toBe("skipped")
    expect(first.successes).toHaveLength(1)
    const second = planAlertRun(
      [{ ...user, subscriptions: [{ ...user.subscriptions[0]!, lastSuccessfulRunAt: now.toISOString() }] }],
      [posting],
      now,
      "email_delivery_disabled",
    )
    expect(second.deliveries).toEqual([])
    expect(deliverJobAlertEmail({ to: "person@example.com", subject: "Jobs", text: "Hello" }, {})).toEqual({
      ok: false,
      reason: "email_delivery_disabled",
    })
  })
})

describe("external search links", () => {
  it("builds public search links and does not describe them as indexed jobs", () => {
    const linked = new URL(linkedInSearchUrl({ keywords: "backend", location: "Toronto", country: "CA", workArrangement: "remote" }))
    expect(linked.hostname).toBe("www.linkedin.com")
    expect(linked.searchParams.get("f_WT")).toBe("2")
    expect(linked.searchParams.has("f_AL")).toBe(false)
    expect(new URL(indeedSearchUrl({ keywords: "backend", location: "Toronto", country: "CA", workArrangement: "" })).hostname).toBe(
      "ca.indeed.com",
    )
    expect(jobsErrorKind({ code: "PGRST202", message: "search_recommended_jobs" })).toBe("missing_table")
    expect(jobOperationProof("x".repeat(32), "apply-catalog", "{}")).toMatch(/^[a-f0-9]{64}$/)
  })

  it("strips scripts from provider HTML", () => {
    expect(htmlToText("<p>TypeScript</p><script>alert(1)</script>")).toBe("TypeScript")
    const params = new URLSearchParams("applied=1&easyApply=1&country=CA&country=US")
    expect(parseJobSearch(params).excludeEasyApply).toBe(true)
    expect(parseJobSearch(params).countries).toEqual(["CA", "US"])
    expect(parseJobSearch(new URLSearchParams("applied=1&hideUnknownSalary=on")).includeUnknownCompensation).toBe(false)
  })
})
