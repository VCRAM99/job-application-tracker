import type { Metadata } from "next"
import Link from "next/link"

import { AlertEditor } from "@/components/jobs/alert-editor"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { deleteAlertSubscription, markAlertRead, saveAlertSubscription } from "@/lib/jobs/actions"
import { loadAlertDesk, loadJobPreferences } from "@/lib/jobs/data"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { jobEmailDeliveryEnabled } from "@/lib/jobs/flags"

export const metadata: Metadata = { title: "Job alerts" }

export default async function JobAlertsPage() {
  if (!recommendedJobsEnabled()) {
    return (
      <RecordState
        title="Recommended jobs are off"
        description="Alerts stay off with the recommended jobs section."
      />
    )
  }
  const [desk, preferences] = await Promise.all([loadAlertDesk(), loadJobPreferences()])
  if (!desk.ok) {
    return (
      <RecordState
        tone="error"
        title="Alerts could not be loaded"
        description={
          desk.error === "missing_table"
            ? "Apply the recommended jobs migration, then reload."
            : "Alert settings could not be loaded. Refresh the page and try again."
        }
      />
    )
  }

  const timezone = preferences.ok && preferences.data ? preferences.data.timezone : "UTC"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Job alerts"
        description="Daily and weekly alerts are off until you turn them on. Email is stored as skipped until a sender is approved."
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
      {!jobEmailDeliveryEnabled() ? (
        <p className="text-sm text-muted-foreground">
          In-app alert history is saved. Email is not sent.
        </p>
      ) : null}
      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-medium">New alert</h2>
        <div className="mt-4">
          <AlertEditor subscription={null} searches={desk.data.searches} timezone={timezone} action={saveAlertSubscription} />
        </div>
      </section>
      {desk.data.subscriptions.length === 0 ? (
        <RecordState title="No alerts yet" description="Create an alert above. The default cadence is off." />
      ) : (
        desk.data.subscriptions.map((subscription) => (
          <section key={subscription.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-medium">
                {subscription.cadence === "off" ? "Alerts off" : `${subscription.cadence} alert`}
                {subscription.paused ? " · paused" : ""}
              </h2>
              <form action={deleteAlertSubscription}>
                <input type="hidden" name="id" value={subscription.id} />
                <Button type="submit" variant="outline" size="sm">
                  Delete
                </Button>
              </form>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Last successful run: {subscription.lastSuccessfulRunAt ?? "Never"}
              {subscription.lastError ? ` · Last error: ${subscription.lastError}` : ""}
            </p>
            <AlertEditor
              subscription={subscription}
              searches={desk.data.searches}
              timezone={timezone}
              action={saveAlertSubscription}
            />
          </section>
        ))
      )}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Alert history</h2>
        {desk.data.deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts have been recorded.</p>
        ) : (
          <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {desk.data.deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p>
                    {delivery.channel === "email" ? "Email" : "In app"} · {delivery.status}
                    {delivery.error ? ` · ${delivery.error}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {delivery.windowKey} · {delivery.createdAt.slice(0, 10)}
                    {delivery.readAt ? " · Read" : ""}
                  </p>
                </div>
                {delivery.readAt ? null : (
                  <form action={markAlertRead}>
                    <input type="hidden" name="id" value={delivery.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Mark read
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
