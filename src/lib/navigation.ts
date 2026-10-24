export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/companies", label: "Companies" },
  { href: "/applications", label: "Applications" },
  { href: "/jobs", label: "Jobs" },
  { href: "/networking", label: "Networking" },
  { href: "/tasks", label: "Tasks" },
  { href: "/daily-tasks", label: "Daily Tasks" },
  { href: "/preparation", label: "Preparation" },
  { href: "/career", label: "Career" },
  { href: "/settings", label: "Settings" },
] as const

export type NavFlags = {
  career: boolean
  jobs: boolean
}

export function visibleNavItems(flags: NavFlags) {
  return NAV_ITEMS.filter((item) => {
    if (item.href === "/career") return flags.career
    if (item.href === "/jobs") return flags.jobs
    return true
  })
}

export type NavHref = (typeof NAV_ITEMS)[number]["href"]

export function sectionKey(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home"
}
