import { Mark } from "@/components/brand/mark"
import { signOut } from "@/lib/auth/actions"
import type { AuthenticatedUser } from "@/lib/auth/session"
import { NavLinks } from "@/components/shell/nav-links"
import { MobileNav } from "@/components/shell/mobile-nav"
import { PageTransition } from "@/components/shell/page-transition"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline" size="sm" className="w-full">
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
  const email = user.email ?? "Signed in"

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <Mark className="size-6 text-sidebar-foreground" />
          <p className="text-sm font-medium tracking-tight">Job Tracker</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          <NavLinks />
        </div>
        <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
          <p className="truncate px-1 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="min-w-0 flex-1">
              <SignOutButton />
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-3 md:hidden">
          <MobileNav />
          <Mark className="size-6" />
          <p className="flex-1 text-sm font-medium tracking-tight">Job Tracker</p>
          <ThemeToggle />
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
