"use client"

import { cn } from "cn"
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CheckSquare,
  IdCard,
  LayoutDashboard,
  Radar,
  FileText,
  ScanSearch,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { NavHref } from "@/lib/navigation"
import { NAV_ITEMS, groupedNavItems } from "@/lib/navigation"

type NavItem = (typeof NAV_ITEMS)[number]

const ICONS: Record<NavHref, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/companies": Building2,
  "/applications": Briefcase,
  "/jobs": Radar,
  "/resumes": FileText,
  "/analyze": ScanSearch,
  "/networking": Users,
  "/tasks": CheckSquare,
  "/daily-tasks": CalendarCheck,
  "/preparation": BookOpen,
  "/career": IdCard,
  "/settings": Settings,
}

export function NavLinks({
  items = NAV_ITEMS,
  onNavigate,
  className,
}: {
  items?: readonly NavItem[]
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className={cn("flex flex-col gap-4", className)}>
      {groupedNavItems(items).map(({ group, items: groupItems }) => (
        <div key={group} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
          <ul className="flex flex-col gap-0.5">
            {groupItems.map((item) => {
              const Icon = ICONS[item.href]
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex min-h-10 items-center md:min-h-8 gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
