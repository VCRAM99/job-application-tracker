import type { Metadata } from "next"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { changePassword, signOut } from "@/lib/auth/actions"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const user = await requireUser()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Account details for the signed-in user. Application data settings will
          be added later.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>This session is stored in a secure cookie.</CardDescription>
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
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing the password for a signed-in account requires the current
            password. Email recovery uses a separate link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm updatePassword={changePassword} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>The interface starts in dark mode.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Switch between dark and light.</p>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  )
}
