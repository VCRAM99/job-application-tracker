import { localDateInTimeZone } from "@/lib/daily/calendar"
import { addCalendarDays } from "@/lib/records/logic"

/** Timing rules. No AI decides when to follow up. */
export const FOLLOW_UP_RULES = {
  /** An application still in Applied this many days after it got there. */
  appliedStaleDays: 7,
  /** A thank-you is due this many hours after an interview stage starts. */
  thankYouDueHours: 24,
  /** The thank-you suggestion stays visible this long after the stage starts. */
  thankYouShowHours: 72,
} as const

export const INTERVIEW_STAGES = ["recruiter_screen", "technical_interview", "final_interview"] as const

export type FollowUpRule = "applied_stale" | "thank_you" | "contact_follow_up"

export type FollowUpApplication = {
  id: string
  jobTitle: string
  companyName: string | null
  status: string
  /** YYYY-MM-DD as entered by the user. */
  appliedAt: string | null
  /** ISO timestamp from the database; null for rows from before M5. */
  statusChangedAt: string | null
  updatedAt: string
}

export type FollowUpContact = { id: string; name: string; nextFollowUpDate: string | null; applicationId: string | null }

export type SuggestionState = { dismissed: boolean; openTask: boolean }

export type FollowUpSuggestion = {
  key: string
  rule: FollowUpRule
  title: string
  detail: string
  /** Local date the follow-up is due. */
  dueDate: string
  overdue: boolean
  applicationId: string | null
  contactId: string | null
  draftKind: "follow_up" | "thank_you"
}

function daysBetween(from: string, to: string): number {
  const parse = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function instant(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function label(application: FollowUpApplication) {
  return application.companyName ? `${application.jobTitle} at ${application.companyName}` : application.jobTitle
}

/**
 * Deterministic suggestions, computed in the user's timezone:
 * - an application in Applied for at least 7 local days since it was applied
 *   or last changed status, whichever is later;
 * - a thank-you within 24 hours of entering an interview stage, shown for 72;
 * - a contact whose next follow-up date is today or earlier.
 * A suggestion the user dismissed, or one whose task still exists, is hidden.
 */
export function followUpSuggestions(input: {
  applications: FollowUpApplication[]
  contacts: FollowUpContact[]
  now: Date
  timeZone: string
  states?: Map<string, SuggestionState>
}): FollowUpSuggestion[] {
  const today = localDateInTimeZone(input.now, input.timeZone)
  const out: FollowUpSuggestion[] = []

  for (const application of input.applications) {
    if (application.status === "applied") {
      const changed = instant(application.statusChangedAt)
      const changedDate = changed ? localDateInTimeZone(changed, input.timeZone) : null
      const candidates = [application.appliedAt, changedDate].filter(isDate).sort()
      const anchor = candidates[candidates.length - 1]
      if (anchor && daysBetween(anchor, today) >= FOLLOW_UP_RULES.appliedStaleDays) {
        const dueDate = addCalendarDays(anchor, FOLLOW_UP_RULES.appliedStaleDays)
        out.push({
          key: `applied_stale:${application.id}:${anchor}`,
          rule: "applied_stale",
          title: `Follow up on ${label(application)}`,
          detail: `Applied ${daysBetween(anchor, today)} days ago with no status change.`,
          dueDate,
          overdue: dueDate < today,
          applicationId: application.id,
          contactId: null,
          draftKind: "follow_up",
        })
      }
    }
    if ((INTERVIEW_STAGES as readonly string[]).includes(application.status)) {
      const entered = instant(application.statusChangedAt) ?? instant(application.updatedAt)
      if (entered) {
        const hours = (input.now.getTime() - entered.getTime()) / 3_600_000
        if (hours >= 0 && hours <= FOLLOW_UP_RULES.thankYouShowHours) {
          const due = new Date(entered.getTime() + FOLLOW_UP_RULES.thankYouDueHours * 3_600_000)
          const enteredDate = localDateInTimeZone(entered, input.timeZone)
          out.push({
            key: `thank_you:${application.id}:${application.status}-${enteredDate}`,
            rule: "thank_you",
            title: `Send a thank-you for ${label(application)}`,
            detail: hours > FOLLOW_UP_RULES.thankYouDueHours ? "The interview stage started over a day ago." : "Within a day of the interview is best.",
            dueDate: localDateInTimeZone(due, input.timeZone),
            overdue: hours > FOLLOW_UP_RULES.thankYouDueHours,
            applicationId: application.id,
            contactId: null,
            draftKind: "thank_you",
          })
        }
      }
    }
  }

  for (const contact of input.contacts) {
    if (!isDate(contact.nextFollowUpDate) || contact.nextFollowUpDate > today) continue
    out.push({
      key: `contact_follow_up:${contact.id}:${contact.nextFollowUpDate}`,
      rule: "contact_follow_up",
      title: `Follow up with ${contact.name}`,
      detail: contact.nextFollowUpDate === today ? "Follow-up date is today." : `Follow-up date was ${contact.nextFollowUpDate}.`,
      dueDate: contact.nextFollowUpDate,
      overdue: contact.nextFollowUpDate < today,
      applicationId: contact.applicationId,
      contactId: contact.id,
      draftKind: "follow_up",
    })
  }

  const states = input.states ?? new Map()
  return out
    .filter((suggestion) => {
      const state = states.get(suggestion.key)
      return !state || (!state.dismissed && !state.openTask)
    })
    .sort((left, right) => (left.dueDate === right.dueDate ? left.key.localeCompare(right.key) : left.dueDate < right.dueDate ? -1 : 1))
}

export const SUGGESTION_KEY = /^(applied_stale|thank_you|contact_follow_up):[0-9a-f-]{36}:[a-z0-9_-]{1,40}$/
