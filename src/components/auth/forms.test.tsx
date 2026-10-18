import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { LoginForm } from "@/components/auth/login-form"
import { SignupForm } from "@/components/auth/signup-form"
import { initialAuthFormState } from "@/lib/auth/form-state"

describe("authentication forms", () => {
  it("shows a login validation error before calling the server", async () => {
    const user = userEvent.setup()
    const authenticate = vi.fn().mockResolvedValue(initialAuthFormState)

    render(<LoginForm authenticate={authenticate} nextPath="/dashboard" notice={null} />)

    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.type(screen.getByLabelText("Password"), "secret")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText(/valid email/i)).toBeTruthy()
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("shows a signup password mismatch before calling the server", async () => {
    const user = userEvent.setup()
    const authenticate = vi.fn().mockResolvedValue(initialAuthFormState)

    render(<SignupForm authenticate={authenticate} />)

    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correcthorse1")
    await user.type(screen.getByLabelText("Confirm password"), "correcthorse2")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Passwords do not match.")).toBeTruthy()
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("requires the current password before calling the signed-in change action", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn().mockResolvedValue(initialAuthFormState)

    render(<ChangePasswordForm updatePassword={updatePassword} />)

    await user.type(screen.getByLabelText("New password"), "password2")
    await user.type(screen.getByLabelText("Confirm new password"), "password2")
    await user.click(screen.getByRole("button", { name: "Update password" }))

    expect(await screen.findByText("Current password is required.")).toBeTruthy()
    expect(updatePassword).not.toHaveBeenCalled()
  })
})
