import type { Metadata } from "next"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { AiSettingsSection } from "@/components/settings/ai-settings"
import { DeveloperNote } from "@/components/settings/developer-note"
import { ThemeToggle } from "@/components/theme-toggle"
import { PageHeader } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { setHealthTracking } from "@/lib/daily/actions"
import { getDailyPreference } from "@/lib/daily/data"
import { changePassword, signOut } from "@/lib/auth/actions"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const user = await requireUser()
  const preference = await getDailyPreference()
  const healthOn = preference.ok && preference.data.healthTrackingEnabled

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader title="Settings" help="Account, password, appearance, and optional career AI for this signed-in session." />
      <Card>
        <CardHeader>
          <CardTitle help="This session is stored in a secure cookie.">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1">{user.email ?? "No email on this session"}</dd>
            </div>
          </dl>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle help="Changing the password for a signed-in account requires the current password. Email recovery uses a separate link.">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm updatePassword={changePassword} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle help="The interface starts in dark mode.">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Switch between dark and light.</p>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle help="Optional personal health notes on Daily Tasks. Off by default. Turning this off hides the section and keeps saved entries private to this account.">Health Tracking (Beta)</CardTitle>
        </CardHeader>
        <CardContent>
          {preference.ok ? (
            <form action={setHealthTracking}>
              <input type="hidden" name="enabled" value={healthOn ? "false" : "true"} />
              <Button type="submit" variant="outline">
                {healthOn ? "Turn off" : "Turn on"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Health tracking is not available until the daily tasks migration is applied.
            </p>
          )}
        </CardContent>
      </Card>
      <AiSettingsSection />
      <Card>
        <CardHeader>
          <CardTitle help="The person who built this workspace.">More about the developer</CardTitle>
        </CardHeader>
        <CardContent>
          <DeveloperNote />
        </CardContent>
      </Card>
    </div>
  )
}
