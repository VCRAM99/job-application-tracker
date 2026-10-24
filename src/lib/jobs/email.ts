import { jobEmailDeliveryEnabled } from "@/lib/jobs/flags"

export type JobAlertEmail = {
  to: string
  subject: string
  text: string
}

/**
 * No network sender is implemented. A configured flag still does not send mail
 * until an approved provider exists.
 */
export function deliverJobAlertEmail(
  _message: JobAlertEmail,
  env: Record<string, string | undefined> = process.env,
): { ok: false; reason: "email_delivery_disabled" | "sender_not_approved" } {
  if (!jobEmailDeliveryEnabled(env)) return { ok: false, reason: "email_delivery_disabled" }
  return { ok: false, reason: "sender_not_approved" }
}
