import { signOut } from "@/lib/auth/actions"
import type { AuthenticatedUser } from "@/lib/auth/session"
import { NavLinks } from "@/components/shell/nav-links"
import { MobileNav } from "@/components/shell/mobile-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline" className="w-full">
        Sign out
      </Button>
    </form>
  )
}

export function AppShell({
  user,
  children,
}: {
  user: AuthenticatedUser
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center px-4">
          <p className="text-sm font-medium tracking-tight">Job Tracker</p>
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks />
        </div>
        <Separator />
        <div className="flex flex-col gap-3 p-3">
          <p className="truncate px-1 text-xs text-muted-foreground" title={user.email ?? undefined}>
            {user.email ?? "Signed in"}
          </p>
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <div className="min-w-0 flex-1">
              <SignOutButton />
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <MobileNav />
          <p className="flex-1 text-sm font-medium">Job Tracker</p>
          <ThemeToggle />
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
