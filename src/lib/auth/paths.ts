import { NAV_ITEMS } from "@/lib/navigation"

export const PROTECTED_PATHS = NAV_ITEMS.map((item) => item.href)

export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"] as const

const PROTECTED_PATH_SET = new Set<string>(PROTECTED_PATHS)
const GUEST_ONLY_PATH_SET = new Set<string>(GUEST_ONLY_PATHS)

export function isAuthConfirmPath(pathname: string): boolean {
  return pathname === "/auth/confirm" || pathname.startsWith("/auth/confirm/")
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_PATH_SET.has(pathname)
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/reset-password" ||
    isGuestOnlyPath(pathname) ||
    isAuthConfirmPath(pathname)
  )
}

/**
 * Accept only same-origin paths. Reject protocol-relative and backslash
 * forms that browsers can treat as a different site.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return fallback
  }

  if (!decoded.startsWith("/")) return fallback
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback
  if (decoded.includes("\\") || decoded.includes("://") || decoded.includes("\0")) {
    return fallback
  }

  return decoded
}

export type SessionGate =
  | { type: "continue" }
  | { type: "redirect"; pathname: string; search: string }

export function sessionGate(
  pathname: string,
  searchParams: URLSearchParams,
  isAuthenticated: boolean,
): SessionGate {
  if (isAuthConfirmPath(pathname)) {
    return { type: "continue" }
  }

  if (pathname === "/") {
    return {
      type: "redirect",
      pathname: isAuthenticated ? "/dashboard" : "/login",
      search: "",
    }
  }

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const destination = safeNextPath(
      `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
    )
    const params = new URLSearchParams()
    if (destination !== "/dashboard") {
      params.set("next", destination)
    }
    return {
      type: "redirect",
      pathname: "/login",
      search: params.size > 0 ? `?${params.toString()}` : "",
    }
  }

  if (isAuthenticated && isGuestOnlyPath(pathname)) {
    const next = safeNextPath(searchParams.get("next"))
    return { type: "redirect", pathname: next, search: "" }
  }

  return { type: "continue" }
}

export function isKnownProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_SET.has(pathname)
}
