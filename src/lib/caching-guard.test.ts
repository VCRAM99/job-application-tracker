// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Caching rule (docs/architecture.md): shared caches ("use cache",
 * unstable_cache, cacheLife, cacheTag) may hold only public, user-independent
 * data. They are allowed only under src/lib/public, and those files may not
 * read the session, cookies, headers, or the RLS-scoped Supabase client.
 * React `cache()` is request-scoped and allowed anywhere.
 */
const ROOT = path.resolve(__dirname, "..")
const PUBLIC_DIR = path.join(ROOT, "lib/public")
const SHARED_CACHE = /^\s*["']use cache(?::\s*[a-z]+)?["']|\bunstable_cache\b|\bcacheLife\s*\(|\bcacheTag\s*\(/m
const USER_SCOPED = [
  /from\s+["']@\/lib\/supabase\/server["']/,
  /from\s+["']@\/lib\/auth\/session["']/,
  /from\s+["']next\/headers["']/,
  /\brequireUser\s*\(/,
  /\bgetCurrentUser\s*\(/,
  /\bcookies\s*\(/,
  /\bheaders\s*\(/,
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

describe("caching guard", () => {
  const files = sourceFiles(ROOT)

  it("finds source files", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("keeps shared caches out of user-scoped code", () => {
    const offenders = files
      .filter((file) => SHARED_CACHE.test(readFileSync(file, "utf8")))
      .filter((file) => !file.startsWith(PUBLIC_DIR + path.sep))
      .map((file) => path.relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it("keeps public cached modules free of session, cookie, and RLS access", () => {
    const offenders = files
      .filter((file) => file.startsWith(PUBLIC_DIR + path.sep))
      .filter((file) => USER_SCOPED.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
      .map((file) => path.relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it("catches a shared cache directive", () => {
    expect(SHARED_CACHE.test(`export async function f() {\n  "use cache"\n  return 1\n}`)).toBe(true)
    expect(SHARED_CACHE.test(`"use cache: private"`)).toBe(true)
    expect(SHARED_CACHE.test(`const load = unstable_cache(async () => 1)`)).toBe(true)
    expect(SHARED_CACHE.test(`import { cache } from "react"\nexport const user = cache(async () => 1)`)).toBe(false)
  })
})
