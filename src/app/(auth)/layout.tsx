import type { Metadata } from "next"

import { Mark } from "@/components/brand/mark"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  description: "Sign in to Job Tracker to manage applications, companies, and follow-ups.",
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--muted),transparent_55%)]"
      />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="page-enter surface relative w-full max-w-sm p-6 shadow-none">
        <div className="mb-6 flex items-center gap-2">
          <Mark className="size-7" />
          <p className="text-sm font-medium tracking-tight">Job Tracker</p>
        </div>
        {children}
      </div>
    </div>
  )
}
