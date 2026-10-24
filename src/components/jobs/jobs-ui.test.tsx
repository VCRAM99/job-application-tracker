import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { JobSearchForm } from "@/components/jobs/job-search-form"
import { initialJobActionState } from "@/lib/jobs/action-state"
import { emptyJobSearch } from "@/lib/jobs/query"

describe("recommended jobs search form", () => {
  it("shows the easy apply control and a responsive filter grid", () => {
    render(
      <JobSearchForm
        state={{ ...emptyJobSearch, keywords: "backend" }}
        savePreferences={async () => ({ ...initialJobActionState, status: "success", message: "Preferences saved." })}
        saveNamedSearch={async () => initialJobActionState}
      />,
    )
    expect(screen.getByRole("checkbox", { name: "Exclude LinkedIn Easy Apply" })).toBeTruthy()
    const linkedIn = screen.getByRole("button", { name: "Search LinkedIn" })
    expect(linkedIn.getAttribute("href")).toContain("https://www.linkedin.com/jobs/search/")
    expect(linkedIn.getAttribute("target")).toBe("_blank")
    expect(screen.getByText(/not indexed jobs/i)).toBeTruthy()
    expect(document.querySelector("form")?.className).toContain("lg:grid-cols-4")
  })
})
