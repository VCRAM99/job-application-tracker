// @vitest-environment node

import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Off states are what a signed-in user outside the beta sees in production, so they must speak to
 * that user. Operator instructions (environment variable names) belong in docs/launch.md.
 */
const OFF_STATE_FILES = [
  "src/app/(app)/analyze/page.tsx",
  "src/app/(app)/analyze/[id]/page.tsx",
  "src/app/(app)/jobs/page.tsx",
  "src/app/(app)/jobs/[id]/page.tsx",
  "src/app/(app)/career/page.tsx",
  "src/components/coach/view.tsx",
  "src/components/resume/off.tsx",
  "src/components/settings/ai-settings.tsx",
]

describe("feature off states", () => {
  it.each(OFF_STATE_FILES)("%s names no server setting", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8")
    const descriptions = [...source.matchAll(/description="([^"]*)"|<CardDescription>([^<]*)<\/CardDescription>/g)].map((match) => match[1] ?? match[2])
    expect(descriptions.length).toBeGreaterThan(0)
    for (const text of descriptions) {
      expect(text).not.toMatch(/[A-Z]+_[A-Z_]+|=true|on the server|feature flag/)
    }
  })
})
