import { describe, expect, it } from "vitest"

import { sliceChars } from "@/lib/resume/text"

describe("sliceChars", () => {
  it("never leaves a lone surrogate at the cut", () => {
    expect(sliceChars("ab😀c", 3)).toBe("ab")
    expect(sliceChars("ab😀c", 4)).toBe("ab😀")
    expect(sliceChars("short", 10)).toBe("short")
    expect(JSON.parse(JSON.stringify(sliceChars("x".repeat(119) + "😀", 120)))).toBe("x".repeat(119))
  })
})
