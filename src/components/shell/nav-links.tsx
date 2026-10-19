"use client"

import { cn } from "cn"
import {
  BookOpen,
  Briefcase,
  Building2,
  CheckSquare,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { NavHref } from "@/lib/navigation"
import { NAV_ITEMS } from "@/lib/navigation"

const ICONS: Record<NavHref, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/companies": Building2,
  "/applications": Briefcase,
  "/networking": Users,
  "/tasks": CheckSquare,
  "/preparation": BookOpen,
  "/settings": Settings,
}

export function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className={cn("flex flex-col gap-1", className)}>
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.href]
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/70",
            )}
          >
            <Icon className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
