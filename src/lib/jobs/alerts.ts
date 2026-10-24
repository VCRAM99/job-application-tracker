import { passesHardFilters, type HardFilterInput } from "@/lib/jobs/filters"
import { scorePosting, type MatchSignals } from "@/lib/jobs/score"

export type AlertCadence = "off" | "daily" | "weekly"

export function alertWindowKey(cadence: "daily" | "weekly", timeZone: string, now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  if (cadence === "daily") return `daily:${day}`
  const utc = new Date(`${day}T00:00:00Z`)
  const weekday = utc.getUTCDay()
  const delta = weekday === 0 ? 6 : weekday - 1
  utc.setUTCDate(utc.getUTCDate() - delta)
  return `weekly:${utc.toISOString().slice(0, 10)}`
}

export function isAlertDue(input: {
  cadence: AlertCadence
  paused: boolean
  timeZone: string
  lastSuccessfulRunAt: string | null
  now: Date
}): boolean {
  if (input.paused || input.cadence === "off") return false
  if (!input.lastSuccessfulRunAt) return true
  const last = new Date(input.lastSuccessfulRunAt)
  if (Number.isNaN(last.getTime())) return true
  try {
    return (
      alertWindowKey(input.cadence, input.timeZone, last) !==
      alertWindowKey(input.cadence, input.timeZone, input.now)
    )
  } catch {
    return false
  }
}

export type AlertPosting = {
  id: string
  title: string
  titleTokens: string[]
  skillTokens: string[]
  seniority: string
  employerId: string | null
  countryCode: string | null
  workArrangement: string
  employmentType: string
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
  postedAt: string | null
  lastVerifiedAt: string | null
  applicationMethod: string
  locationText: string | null
  skills: string[]
}

export type AlertSubscription = {
  id: string
  cadence: "daily" | "weekly"
  minimumMatch: number
  delivery: "in_app" | "email" | "both"
  timeZone: string
  lastSuccessfulRunAt: string | null
  filters: HardFilterInput
}

export type AlertUser = {
  userId: string
  signals: MatchSignals
  preferredEmployerIds: string[]
  hiddenPostingIds: string[]
  subscriptions: AlertSubscription[]
}

export type PlannedDelivery = {
  userId: string
  subscriptionId: string
  postingId: string
  windowKey: string
  channel: "in_app" | "email"
  status: "recorded" | "skipped"
  error: string | null
}

export type AlertPlan = {
  deliveries: PlannedDelivery[]
  successes: Array<{ subscriptionId: string; ranAt: string }>
  failures: Array<{ subscriptionId: string; error: string }>
}

function channels(delivery: AlertSubscription["delivery"]): Array<"in_app" | "email"> {
  if (delivery === "in_app") return ["in_app"]
  return ["in_app", "email"]
}

/**
 * Plans one window of alerts. Email rows are skipped until a sender is approved.
 * An empty match list still counts as a successful run so the same window is not repeated.
 */
export function planAlertRun(
  users: readonly AlertUser[],
  postings: readonly AlertPosting[],
  now: Date,
  emailReason: string,
): AlertPlan {
  const deliveries: PlannedDelivery[] = []
  const successes: AlertPlan["successes"] = []
  const failures: AlertPlan["failures"] = []

  for (const user of users) {
    for (const subscription of user.subscriptions) {
      let windowKey: string
      try {
        if (!isAlertDue({ ...subscription, paused: false, now })) continue
        windowKey = alertWindowKey(subscription.cadence, subscription.timeZone, now)
      } catch {
        failures.push({ subscriptionId: subscription.id, error: "invalid_timezone" })
        continue
      }

      for (const posting of postings) {
        if (user.hiddenPostingIds.includes(posting.id)) continue
        if (!passesHardFilters(posting, subscription.filters, now)) continue
        const estimate = scorePosting(
          { ...user.signals, seniorities: subscription.filters.seniorities },
          {
            titleTokens: posting.titleTokens,
            skillTokens: posting.skillTokens,
            seniority: posting.seniority,
            preferred: Boolean(posting.employerId && user.preferredEmployerIds.includes(posting.employerId)),
            referenceAt: posting.lastVerifiedAt ?? posting.postedAt,
          },
          now,
        )
        if (estimate.score < subscription.minimumMatch) continue
        for (const channel of channels(subscription.delivery)) {
          deliveries.push({
            userId: user.userId,
            subscriptionId: subscription.id,
            postingId: posting.id,
            windowKey,
            channel,
            status: channel === "email" ? "skipped" : "recorded",
            error: channel === "email" ? emailReason : null,
          })
        }
      }
      successes.push({ subscriptionId: subscription.id, ranAt: now.toISOString() })
    }
  }

  return { deliveries, successes, failures }
}
