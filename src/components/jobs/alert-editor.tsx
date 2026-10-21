"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/records/fields"
import { initialJobActionState, type JobActionState } from "@/lib/jobs/action-state"
import type { AlertSubscriptionView } from "@/lib/jobs/data"

export function AlertEditor({
  subscription,
  searches,
  timezone,
  action,
}: {
  subscription: AlertSubscriptionView | null
  searches: Array<{ id: string; name: string }>
  timezone: string
  action: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
}) {
  const [state, formAction, pending] = useActionState(action, initialJobActionState)
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {subscription ? <input type="hidden" name="id" value={subscription.id} /> : null}
      <label className="space-y-1 text-sm">
        <span className="font-medium">Cadence</span>
        <NativeSelect name="cadence" defaultValue={subscription?.cadence ?? "off"}>
          <option value="off">Alerts off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </NativeSelect>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">Delivery</span>
        <NativeSelect name="delivery" defaultValue={subscription?.delivery ?? "in_app"}>
          <option value="in_app">In the app</option>
          <option value="email">Email (not sent until a sender is approved)</option>
          <option value="both">In the app and email</option>
        </NativeSelect>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">Minimum match estimate</span>
        <Input
          name="minimumMatch"
          type="number"
          min={0}
          max={100}
          defaultValue={subscription?.minimumMatch ?? 40}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">Timezone</span>
        <Input name="timezone" defaultValue={subscription?.timezone ?? timezone} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium">Saved search</span>
        <NativeSelect name="savedSearchId" defaultValue={subscription?.savedSearchId ?? ""}>
          <option value="">Use job preferences</option>
          {searches.map((search) => (
            <option key={search.id} value={search.id}>
              {search.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="paused" defaultChecked={subscription?.paused ?? false} />
        Pause this alert
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : subscription ? "Update alert" : "Create alert"}
        </Button>
        {state.message ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
