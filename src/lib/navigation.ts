export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/companies", label: "Companies" },
  { href: "/applications", label: "Applications" },
  { href: "/networking", label: "Networking" },
  { href: "/tasks", label: "Tasks" },
  { href: "/daily-tasks", label: "Daily Tasks" },
  { href: "/preparation", label: "Preparation" },
  { href: "/career", label: "Career" },
  { href: "/settings", label: "Settings" },
] as const

export function visibleNavItems(aiEnabled: boolean) {
  return NAV_ITEMS.filter((item) => aiEnabled || item.href !== "/career")
}

export type NavHref = (typeof NAV_ITEMS)[number]["href"]

export function sectionKey(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home"
}
