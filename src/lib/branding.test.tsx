import { readFileSync } from "node:fs"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DeveloperNote } from "@/components/settings/developer-note"
import { DEVELOPER_CREDIT, PORTFOLIO_URL, PRODUCT_NAME, titleTemplate } from "@/lib/branding"
import { sectionKey } from "@/lib/navigation"

describe("branding", () => {
  it("uses a consistent browser title template", () => {
    expect(titleTemplate).toBe(`%s | ${PRODUCT_NAME}`)
    expect(PRODUCT_NAME).toBe("Job Tracker")
  })

  it("links to the developer portfolio in a new tab", () => {
    render(<DeveloperNote />)
    const link = screen.getByRole("link", { name: /visit developer portfolio/i })
    expect(link.getAttribute("href")).toBe(PORTFOLIO_URL)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(link.getAttribute("rel")).toContain("noreferrer")
    expect(screen.getByText(DEVELOPER_CREDIT)).toBeTruthy()
  })

  it("animates only a section change and disables that motion when requested", () => {
    expect(sectionKey("/companies/import")).toBe("companies")
    expect(sectionKey("/applications")).toBe("applications")
    expect(sectionKey("/")).toBe("home")
    const css = readFileSync("src/app/globals.css", "utf8")
    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain(".page-enter { animation: none; }")
  })
})