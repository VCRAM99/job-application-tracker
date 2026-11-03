export const NAV_GROUPS = ["Track", "Discover", "Prepare", "You"] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

/** Sidebar order. Grouped by what you are doing: tracking a search, finding roles, preparing, and your own setup. */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", group: "Track" },
  { href: "/applications", label: "Applications", group: "Track" },
  { href: "/companies", label: "Companies", group: "Track" },
  { href: "/networking", label: "Networking", group: "Track" },
  { href: "/tasks", label: "Tasks", group: "Track" },
  { href: "/jobs", label: "Jobs", group: "Discover" },
  { href: "/analyze", label: "Fit", group: "Discover" },
  { href: "/resumes", label: "Resumes", group: "Prepare" },
  { href: "/preparation", label: "Preparation", group: "Prepare" },
  { href: "/career", label: "Career", group: "Prepare" },
  { href: "/daily-tasks", label: "Daily Tasks", group: "You" },
  { href: "/settings", label: "Settings", group: "You" },
] as const

export type NavFlags = {
  career: boolean
  jobs: boolean
  analyze: boolean
  resumes: boolean
}

export function visibleNavItems(flags: NavFlags) {
  return NAV_ITEMS.filter((item) => {
    if (item.href === "/career") return flags.career
    if (item.href === "/jobs") return flags.jobs
    if (item.href === "/analyze") return flags.analyze
    if (item.href === "/resumes") return flags.resumes
    return true
  })
}

export type NavHref = (typeof NAV_ITEMS)[number]["href"]

export function sectionKey(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home"
}

/** Visible items by group, in order. A group whose items are all hidden by flags is left out. */
export function groupedNavItems<T extends { group: NavGroup }>(items: readonly T[]): Array<{ group: NavGroup; items: T[] }> {
  return NAV_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((entry) => entry.items.length > 0)
}
