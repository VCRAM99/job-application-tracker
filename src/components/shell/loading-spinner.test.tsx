import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LoadingSpinner } from "@/components/shell/loading-spinner"

describe("LoadingSpinner", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("announces loading immediately and shows the spinner only after a short delay", () => {
    render(<LoadingSpinner label="Loading companies…" />)
    expect(screen.getByRole("status").textContent).toContain("Loading companies")
    expect(screen.queryByTestId("loading-spinner")).toBeNull()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId("loading-spinner")).toBeTruthy()
  })
})
