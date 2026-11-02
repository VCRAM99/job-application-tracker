import { describe, expect, it } from "vitest"

import { LIST_PAGE_SIZE, paginate, parsePage } from "@/lib/records/pagination"

describe("list pagination", () => {
  it("parses page numbers and falls back to 1", () => {
    expect(parsePage(new URLSearchParams("page=3"))).toBe(3)
    for (const raw of ["", "page=0", "page=-2", "page=1.5", "page=abc", "page=01", "page=9999999"]) {
      expect(parsePage(new URLSearchParams(raw))).toBe(1)
    }
  })

  it("keeps short lists on one page", () => {
    const rows = Array.from({ length: LIST_PAGE_SIZE }, (_, index) => index)
    expect(paginate(rows, 1)).toMatchObject({ page: 1, pages: 1, total: LIST_PAGE_SIZE, from: 1, to: LIST_PAGE_SIZE })
    expect(paginate([], 4)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 })
  })

  it("slices pages in order and clamps a page past the end", () => {
    const rows = Array.from({ length: 250 }, (_, index) => index)
    expect(paginate(rows, 2)).toMatchObject({ page: 2, pages: 3, from: 101, to: 200 })
    expect(paginate(rows, 2).items[0]).toBe(100)
    expect(paginate(rows, 9)).toMatchObject({ page: 3, from: 201, to: 250 })
    expect(paginate(rows, 9).items).toHaveLength(50)
  })
})
