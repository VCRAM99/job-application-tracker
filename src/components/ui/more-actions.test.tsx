import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { HelpTip } from "@/components/ui/help-tip"
import { MoreActions, MoreActionsButton, MoreActionsLink } from "@/components/ui/more-actions"

function Menu({ onArchive = () => {} }: { onArchive?: () => void }) {
  return (
    <>
      <MoreActions>
        <MoreActionsLink href="/analyze">Analyze fit</MoreActionsLink>
        <MoreActionsButton onClick={onArchive}>Archive</MoreActionsButton>
        <DeleteRecordButton asMenuItem action={vi.fn()} id="a" label="Delete application" title="Delete it?" description="This removes the application." />
      </MoreActions>
      <button type="button">After</button>
    </>
  )
}

describe("MoreActions", () => {
  it("opens, focuses the first item, moves with arrow keys, and closes on Escape back to the button", async () => {
    const user = userEvent.setup()
    render(<Menu />)
    const trigger = screen.getByRole("button", { name: "More actions" })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("link", { name: "Analyze fit" })).toBeNull()

    trigger.focus()
    await user.keyboard("{Enter}")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "Analyze fit" })))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Archive" }))
    await user.keyboard("{ArrowUp}{ArrowUp}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete application" }))
    await user.keyboard("{Escape}")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(trigger)
  })

  it("closes on Tab without trapping focus, and on choosing an item", async () => {
    const user = userEvent.setup()
    const archive = vi.fn()
    render(<Menu onArchive={archive} />)
    const trigger = screen.getByRole("button", { name: "More actions" })
    await user.click(trigger)
    await user.keyboard("{Tab}")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(trigger)

    await user.click(trigger)
    await user.click(screen.getByRole("button", { name: "Archive" }))
    expect(archive).toHaveBeenCalledOnce()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("opens the delete confirmation from the menu and returns focus to the ⋯ button on cancel", async () => {
    const user = userEvent.setup()
    render(<Menu />)
    const trigger = screen.getByRole("button", { name: "More actions" })
    await user.click(trigger)
    await user.click(screen.getByRole("button", { name: "Delete application" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog.textContent).toContain("This removes the application.")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe("HelpTip", () => {
  it("shows its text on focus and tap, and links it to the button", async () => {
    const user = userEvent.setup()
    render(<HelpTip label="About dashboard">Counts come from your records.</HelpTip>)
    const button = screen.getByRole("button", { name: "About dashboard" })
    const tip = document.getElementById(button.getAttribute("aria-describedby")!)!
    expect(tip.textContent).toBe("Counts come from your records.")
    expect(tip.className).toContain("hidden")
    button.focus()
    await waitFor(() => expect(tip.className).toContain("block"))
    await user.keyboard("{Escape}")
    expect(tip.className).toContain("hidden")
    await user.click(button)
    expect(tip.className).toContain("block")
  })
})
