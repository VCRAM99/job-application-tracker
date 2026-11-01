import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { HelpTip } from "@/components/ui/help-tip"

describe("HelpTip", () => {
  it("describes its button and opens on focus, tap, and mouse hover; Escape closes", async () => {
    render(<HelpTip label="About uploads">PDF or Word, up to 5 MB.</HelpTip>)
    const button = screen.getByRole("button", { name: "About uploads" })
    const tip = screen.getByRole("tooltip", { hidden: true })
    expect(button.getAttribute("aria-describedby")).toBe(tip.id)
    expect(tip.className).toContain("hidden")

    await userEvent.tab()
    expect(button.getAttribute("aria-expanded")).toBe("true")
    await userEvent.keyboard("{Escape}")
    expect(button.getAttribute("aria-expanded")).toBe("false")
    button.blur()

    fireEvent.click(button)
    expect(tip.className).toContain("block")
    fireEvent.pointerDown(document.body)
    expect(tip.className).toContain("hidden")

    fireEvent.pointerEnter(button.parentElement!, { pointerType: "mouse" })
    expect(tip.className).toContain("block")
    fireEvent.pointerLeave(button.parentElement!, { pointerType: "mouse" })
    expect(tip.className).toContain("hidden")
  })
})
